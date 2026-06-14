import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizePhone } from '@/lib/phone'
import { umnicoClient } from '@/lib/umnico/client'
import { umnicoTemplates } from '@/lib/umnico/templates'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = createAdminClient()

  const { items, phone, name, delivery, recipient, payment_method } = await req.json()
  const normalizedPhone = normalizePhone(phone)
  if (!items?.length) return NextResponse.json({ error: 'No items' }, { status: 400 })
  if (!phone) return NextResponse.json({ error: 'Phone is required' }, { status: 400 })

  // Find or create client by phone
  const { data: existingClient } = await supabase
    .from('clients')
    .select('id, name, company_name')
    .eq('phone', normalizedPhone)
    .maybeSingle()

  let clientId: string
  let clientName: string | null = null
  let companyName: string | null = null

  if (existingClient) {
    clientId = existingClient.id
    clientName = existingClient.name
    companyName = (existingClient as any).company_name ?? null
    if (name) {
      await supabase.from('clients').update({ name }).eq('id', clientId)
      clientName = name
    }
  } else {
    const { data: newClient, error: clientError } = await supabase
      .from('clients')
      .insert({ phone: normalizedPhone, name: name ?? null })
      .select('id')
      .single()
    if (!newClient) return NextResponse.json({ error: 'Failed to create client', detail: clientError?.message }, { status: 500 })
    clientId = newClient.id
    clientName = name ?? null
  }

  const now = new Date().toISOString()
  const expires_at = new Date(Date.now() + 30 * 60 * 1000).toISOString()

  // Цвет — ярлык, не SKU: остаток/резерв считаем суммарно по product_id.
  // Несколько цветных строк одного товара = одна бронь на товар (цвет в резерв не идёт).
  const qtyByProduct = new Map<number, number>()
  const nameById = new Map<number, string>()
  for (const it of items as any[]) {
    qtyByProduct.set(it.id, (qtyByProduct.get(it.id) ?? 0) + it.qty)
    if (!nameById.has(it.id)) nameById.set(it.id, it.name)
  }

  // Check availability: products.qty minus other clients' reservations
  const reserveErrors: string[] = []
  for (const [productId, wantQty] of qtyByProduct) {
    const { data: product } = await supabase
      .from('products')
      .select('qty')
      .eq('id', productId)
      .single()

    if (!product) {
      reserveErrors.push(`${nameById.get(productId) ?? productId}: товар не найден`)
      continue
    }

    const { data: otherRes } = await supabase
      .from('reservations')
      .select('qty')
      .eq('product_id', productId)
      .gt('expires_at', now)
      .neq('client_id', clientId)

    const othersReserved = (otherRes ?? []).reduce((s: number, r: any) => s + r.qty, 0)
    const available = product.qty - othersReserved
    if (wantQty > available) {
      reserveErrors.push(`${nameById.get(productId) ?? productId}: доступно только ${available} шт`)
    }
  }
  if (reserveErrors.length > 0) {
    return NextResponse.json({ error: reserveErrors.join(', ') }, { status: 409 })
  }

  // Сумма + скидка 1% для Уральска (самовывоз или доставка по городу).
  // Сервер — источник суммы к оплате: payments/init берёт order.total.
  const rawTotal = items.reduce((sum: number, i: any) => sum + i.qty * i.price, 0)
  const isUralsk = delivery?.method === 'pickup'
    || (delivery?.method === 'delivery' && delivery?.city === 'Уральск')
  const discountPct = isUralsk ? 1 : 0
  const total = Math.round(rawTotal * (1 - discountPct / 100))

  // Заметка для менеджера: способ получения, получатель, скидка (флоу чекаута)
  const noteLines: string[] = []
  if (delivery?.method === 'pickup') {
    noteLines.push('Получение: Самовывоз (склад Уральск, ул. Каримуллина, 11)')
  } else if (delivery?.method === 'delivery') {
    noteLines.push(`Получение: Доставка${delivery.city ? ` — ${delivery.city}` : ''}`)
    if (delivery.date)    noteLines.push(`Желаемая дата: ${delivery.date}`)
    if (delivery.address) noteLines.push(`Адрес: ${delivery.address}`)
    if (delivery.comment) noteLines.push(`Комментарий курьеру: ${delivery.comment}`)
  }
  if (recipient) {
    const r = [recipient.name, recipient.phone, recipient.email].filter(Boolean).join(', ')
    if (r) noteLines.push(`Получатель: ${r}`)
  }
  if (discountPct > 0) {
    noteLines.push(`Скидка ${discountPct}% (Уральск): −${(rawTotal - total).toLocaleString('ru-RU')} ₸`)
  }
  const notes = noteLines.length ? noteLines.join('\n') : null

  // Always create a new order
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      client_id: clientId,
      status: 'pending',
      total,
      ...(notes ? { notes } : {}),
      ...(payment_method ? { payment_method } : {}),
    })
    .select()
    .single()
  if (!order) return NextResponse.json({ error: 'Failed to create order', detail: orderError?.message }, { status: 500 })
  const orderId = (order as any).id

  await supabase.from('order_items').insert(
    items.map((i: any) => ({ order_id: orderId, product_id: i.id, qty: i.qty, price: i.price, color: i.color ?? null }))
  )

  // amoCRM sync (non-fatal — ошибка не роняет заказ)
  try {
    const { syncOrderToAmo } = await import('@/lib/amo')
    await syncOrderToAmo(orderId)
  } catch (err) {
    console.error('[checkout] amoCRM sync failed:', err instanceof Error ? err.message : err)
  }

  // Create reservations (replace any existing client reservations for these products).
  // По product_id с суммарным qty — цвет в резерв не входит.
  for (const [productId, totalQty] of qtyByProduct) {
    await supabase.from('reservations').delete()
      .eq('product_id', productId)
      .eq('client_id', clientId)

    await supabase.from('reservations').insert({
      product_id: productId,
      qty: totalQty,
      client_id: clientId,
      expires_at,
      order_id: orderId,
    })
  }

  // Уведомления НЕ отправляются здесь — только после подтверждения оплаты в /api/payments/postlink

  return NextResponse.json({ success: true, order_id: orderId, expires_at })
}

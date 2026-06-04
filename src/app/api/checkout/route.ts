import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { normalizePhone } from '@/lib/phone'
import { umnicoClient } from '@/lib/umnico/client'
import { umnicoTemplates } from '@/lib/umnico/templates'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = await createClient()

  const { items, phone, name } = await req.json()
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

  // Check availability: products.qty minus other clients' reservations
  const reserveErrors: string[] = []
  for (const item of items) {
    const { data: product } = await supabase
      .from('products')
      .select('qty')
      .eq('id', item.id)
      .single()

    if (!product) {
      reserveErrors.push(`${item.name}: товар не найден`)
      continue
    }

    const { data: otherRes } = await supabase
      .from('reservations')
      .select('qty')
      .eq('product_id', item.id)
      .gt('expires_at', now)
      .neq('client_id', clientId)

    const othersReserved = (otherRes ?? []).reduce((s: number, r: any) => s + r.qty, 0)
    const available = product.qty - othersReserved
    if (item.qty > available) {
      reserveErrors.push(`${item.name}: доступно только ${available} шт`)
    }
  }
  if (reserveErrors.length > 0) {
    return NextResponse.json({ error: reserveErrors.join(', ') }, { status: 409 })
  }

  // Always create a new order
  const total = items.reduce((sum: number, i: any) => sum + i.qty * i.price, 0)
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({ client_id: clientId, status: 'pending', total })
    .select()
    .single()
  if (!order) return NextResponse.json({ error: 'Failed to create order', detail: orderError?.message }, { status: 500 })
  const orderId = (order as any).id

  await supabase.from('order_items').insert(
    items.map((i: any) => ({ order_id: orderId, product_id: i.id, qty: i.qty, price: i.price }))
  )

  // amoCRM sync (non-fatal — ошибка не роняет заказ)
  try {
    const { syncOrderToAmo } = await import('@/lib/amo')
    await syncOrderToAmo(orderId)
  } catch (err) {
    console.error('[checkout] amoCRM sync failed:', err instanceof Error ? err.message : err)
  }

  // Create reservations (replace any existing client reservations for these products)
  for (const item of items) {
    await supabase.from('reservations').delete()
      .eq('product_id', item.id)
      .eq('client_id', clientId)

    await supabase.from('reservations').insert({
      product_id: item.id,
      qty: item.qty,
      client_id: clientId,
      expires_at,
      order_id: orderId,
    })
  }

  // Уведомления НЕ отправляются здесь — только после подтверждения оплаты в /api/payments/postlink

  return NextResponse.json({ success: true, order_id: orderId, expires_at })
}

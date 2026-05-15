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
    .select('id, name')
    .eq('phone', normalizedPhone)
    .maybeSingle()

  let clientId: string
  let clientName: string | null = null

  if (existingClient) {
    clientId = existingClient.id
    clientName = existingClient.name
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

  // Check stock availability
  const reserveErrors: string[] = []
  for (const item of items) {
    const { data: stock } = await supabase.from('stock').select('qty').eq('product_id', item.id).single()
    if (!stock) {
      reserveErrors.push(`${item.name}: товар не найден`)
      continue
    }
    const { data: otherRes } = await supabase.from('reservations')
      .select('qty')
      .eq('product_id', item.id)
      .gt('expires_at', now)
      .neq('user_id', clientId)
    const othersReserved = (otherRes ?? []).reduce((s: number, r: any) => s + r.qty, 0)
    const available = stock.qty - othersReserved
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

  // Create reservations for each item (replace any existing client reservations for these products)
  for (const item of items) {
    const { data: existingRes } = await supabase.from('reservations')
      .select('qty')
      .eq('product_id', item.id)
      .eq('user_id', clientId)
      .maybeSingle()

    const oldQty = existingRes?.qty ?? 0
    const qtyChange = item.qty - oldQty

    await supabase.from('reservations').delete()
      .eq('product_id', item.id)
      .eq('user_id', clientId)

    await supabase.from('reservations').insert({
      product_id: item.id,
      qty: item.qty,
      user_id: clientId,
      expires_at,
      order_id: orderId,
    })

    if (qtyChange !== 0) {
      const { data: stock } = await supabase
        .from('stock')
        .select('qty_reserved')
        .eq('product_id', item.id)
        .single()
      await supabase
        .from('stock')
        .update({ qty_reserved: (stock?.qty_reserved ?? 0) + qtyChange })
        .eq('product_id', item.id)
    }
  }

  const itemsList = items
    .map((i: any) => `• ${i.name} × ${i.qty} шт = ${(i.qty * i.price).toLocaleString('ru-RU')} ₸`)
    .join('\n')
  const tgMessage = [
    `🌸 Новый заказ #${orderId}`,
    `👤 ${name || '—'} | 📞 ${phone}`,
    ``,
    itemsList,
    ``,
    `💰 Итого: ${total.toLocaleString('ru-RU')} ₸`,
  ].join('\n')

  try {
    await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text: tgMessage })
    })
  } catch (e) {
    console.error('Telegram notify failed:', e)
  }

  if (process.env.UMNICO_MANAGER_PHONE && process.env.UMNICO_API_TOKEN) {
    try {
      const hasWhatsApp = await umnicoClient.checkContact(process.env.UMNICO_MANAGER_PHONE)
      if (hasWhatsApp) {
        await umnicoClient.sendMessage(
          process.env.UMNICO_MANAGER_PHONE,
          umnicoTemplates.newOrderToManager({
            orderId: String(orderId),
            clientName: name || normalizedPhone,
            clientPhone: normalizedPhone,
            total,
            items: items.map((i: any) => ({ name: i.name || 'Товар', qty: i.qty, price: i.price })),
            adminUrl: 'https://flowers-b2b-phi.vercel.app/admin'
          })
        )
        console.log(`✓ Umnico: уведомление менеджеру (заказ ${orderId})`)
      }
    } catch (error) {
      console.error('Umnico notification failed:', error)
    }
  }

  if (process.env.UMNICO_API_TOKEN && phone) {
    try {
      const hasWhatsApp = await umnicoClient.checkContact(normalizedPhone)
      if (hasWhatsApp) {
        await umnicoClient.sendMessage(
          normalizedPhone,
          umnicoTemplates.orderCreatedToClient(
            String(orderId),
            clientName || 'Уважаемый клиент',
            items.map((i: any) => ({ name: i.name || 'Товар', qty: i.qty, price: i.price })),
            total
          )
        )
        console.log(`✓ Umnico: клиенту о создании заказа ${orderId}`)
      }
    } catch (err) {
      console.error('Umnico client notification failed:', err)
    }
  }

  return NextResponse.json({ success: true, order_id: orderId, expires_at })
}

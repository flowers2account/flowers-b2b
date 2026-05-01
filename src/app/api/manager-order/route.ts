export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { client_id, guest_name, guest_phone, items, confirmed } = await req.json()

  if (!client_id && !guest_name && !guest_phone) {
    return NextResponse.json({ error: 'client_id or guest info required' }, { status: 400 })
  }
  if (!items?.length) return NextResponse.json({ error: 'No items' }, { status: 400 })

  // Проверяем остатки
  const reserveErrors: string[] = []
  for (const item of items) {
    const { data: sa } = await supabase
      .from('stock_available')
      .select('available_qty')
      .eq('product_id', item.id)
      .maybeSingle()
    if (!sa) { reserveErrors.push(`${item.name}: товар не найден`); continue }
    if (item.qty > sa.available_qty) {
      reserveErrors.push(`${item.name}: доступно только ${sa.available_qty} шт`)
    }
  }
  if (reserveErrors.length > 0) {
    return NextResponse.json({ error: reserveErrors.join(', ') }, { status: 409 })
  }

  const total = items.reduce((sum: number, i: any) => sum + i.qty * i.price, 0)

  const { data: order, error: oErr } = await supabase
    .from('orders')
    .insert({
      client_id: client_id ?? null,
      guest_name: guest_name ?? null,
      guest_phone: guest_phone ?? null,
      status: 'pending',
      total,
    })
    .select().single()
  if (!order) return NextResponse.json({ error: oErr?.message }, { status: 500 })

  await supabase.from('order_items').insert(
    items.map((i: any) => ({ order_id: order.id, product_id: i.id, qty: i.qty, price: i.price }))
  )

  const expires_at = new Date(Date.now() + 30 * 60 * 1000).toISOString()

  for (const item of items) {
    await supabase.from('reservations').insert({
      product_id: item.id,
      qty: item.qty,
      user_id: client_id ?? null,
      expires_at,
      order_id: order.id,
    })
    const { data: stock } = await supabase.from('stock')
      .select('qty_reserved').eq('product_id', item.id).single()
    await supabase.from('stock').update({
      qty_reserved: (stock?.qty_reserved ?? 0) + item.qty
    }).eq('product_id', item.id)
  }

  if (confirmed) {
    await supabase.from('orders').update({ status: 'confirmed' }).eq('id', order.id)
    const { error: rpcErr } = await supabase.rpc('confirm_order_fifo', { p_order_id: order.id })
    if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 500 })
  } else {
    await supabase.from('orders').update({ status: 'reserved' }).eq('id', order.id)
  }

  return NextResponse.json({ success: true, order_id: order.id })
}

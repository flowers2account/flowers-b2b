export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { client_id, items } = await req.json()

  if (!client_id) return NextResponse.json({ error: 'client_id required' }, { status: 400 })
  if (!items?.length) return NextResponse.json({ error: 'No items' }, { status: 400 })

  const total = items.reduce((sum: number, i: any) => sum + i.qty * i.price, 0)

  const { data: order, error: oErr } = await supabase
    .from('orders')
    .insert({ client_id, status: 'reserved', total })
    .select().single()
  if (!order) return NextResponse.json({ error: oErr?.message }, { status: 500 })

  await supabase.from('order_items').insert(
    items.map((i: any) => ({ order_id: order.id, product_id: i.id, qty: i.qty, price: i.price }))
  )

  const expires_at = new Date(Date.now() + 30 * 60 * 1000).toISOString()
  for (const item of items) {
    await supabase.from('reservations').insert({
      product_id: item.id, qty: item.qty,
      user_id: client_id, expires_at, order_id: order.id,
    })
    const { data: stock } = await supabase.from('stock')
      .select('qty_reserved').eq('product_id', item.id).single()
    await supabase.from('stock').update({
      qty_reserved: (stock?.qty_reserved ?? 0) + item.qty
    }).eq('product_id', item.id)
  }

  return NextResponse.json({ success: true, order_id: order.id })
}

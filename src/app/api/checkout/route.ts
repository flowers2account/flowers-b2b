import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { items } = await req.json()
  if (!items?.length) return NextResponse.json({ error: 'No items' }, { status: 400 })

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
      .neq('user_id', user.id)
    const othersReserved = (otherRes ?? []).reduce((s: number, r: any) => s + r.qty, 0)
    const available = stock.qty - othersReserved
    if (item.qty > available) {
      reserveErrors.push(`${item.name}: доступно только ${available} шт`)
    }
  }
  if (reserveErrors.length > 0) {
    return NextResponse.json({ error: reserveErrors.join(', ') }, { status: 409 })
  }

  // Find or create active order
  const { data: existingOrder } = await supabase
    .from('orders')
    .select('id')
    .eq('client_id', user.id)
    .in('status', ['pending', 'reserved'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let orderId: number
  let isNewOrder = false

  if (existingOrder) {
    orderId = existingOrder.id

    // Check which products already exist in this order
    const { data: existingItems } = await supabase
      .from('order_items')
      .select('product_id')
      .eq('order_id', orderId)

    const existingProductIds = new Set((existingItems ?? []).map(i => i.product_id))

    // Split items into updates and inserts
    const itemsToUpdate = items.filter((i: any) => existingProductIds.has(i.id))
    const itemsToInsert = items.filter((i: any) => !existingProductIds.has(i.id))

    // Update existing items
    for (const item of itemsToUpdate) {
      await supabase.from('order_items')
        .update({ qty: item.qty, price: item.price })
        .eq('order_id', orderId)
        .eq('product_id', item.id)
    }

    // Insert new items
    if (itemsToInsert.length > 0) {
      await supabase.from('order_items').insert(
        itemsToInsert.map((i: any) => ({ order_id: orderId, product_id: i.id, qty: i.qty, price: i.price }))
      )
    }

    const { data: allItems } = await supabase.from('order_items').select('qty, price').eq('order_id', orderId)
    const newTotal = (allItems ?? []).reduce((sum: number, i: any) => sum + i.qty * i.price, 0)
    await supabase.from('orders').update({ total: newTotal }).eq('id', orderId)
  } else {
    isNewOrder = true
    const total = items.reduce((sum: number, i: any) => sum + i.qty * i.price, 0)
    const { data: order } = await supabase
      .from('orders')
      .insert({ client_id: user.id, status: 'pending', total })
      .select()
      .single()
    if (!order) return NextResponse.json({ error: 'Failed to create order' }, { status: 500 })
    orderId = (order as any).id
    await supabase.from('order_items').insert(
      items.map((i: any) => ({ order_id: orderId, product_id: i.id, qty: i.qty, price: i.price }))
    )
  }

  // Create reservations linked to the order
  for (const item of items) {
    await supabase.from('reservations').delete()
      .eq('product_id', item.id)
      .eq('user_id', user.id)
    await supabase.from('reservations').insert({
      product_id: item.id,
      qty: item.qty,
      user_id: user.id,
      expires_at,
      order_id: orderId,
    })
  }

  return NextResponse.json({ success: true, order_id: orderId, is_new_order: isNewOrder, expires_at })
}

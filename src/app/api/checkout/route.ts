import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = await createClient()

  const { items, phone, name } = await req.json()
  if (!items?.length) return NextResponse.json({ error: 'No items' }, { status: 400 })
  if (!phone) return NextResponse.json({ error: 'Phone is required' }, { status: 400 })

  // Find or create client by phone
  const { data: existingClient } = await supabase
    .from('clients')
    .select('id')
    .eq('phone', phone)
    .maybeSingle()

  let clientId: string

  if (existingClient) {
    clientId = existingClient.id
    if (name) {
      await supabase.from('clients').update({ name }).eq('id', clientId)
    }
  } else {
    const { data: newClient } = await supabase
      .from('clients')
      .insert({ phone, name: name ?? null })
      .select('id')
      .single()
    if (!newClient) return NextResponse.json({ error: 'Failed to create client' }, { status: 500 })
    clientId = newClient.id
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

  // Find or create active order
  const { data: existingOrder } = await supabase
    .from('orders')
    .select('id')
    .eq('client_id', clientId)
    .in('status', ['pending', 'reserved'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let orderId: number
  let isNewOrder = false

  if (existingOrder) {
    orderId = existingOrder.id

    const { data: existingItems } = await supabase
      .from('order_items')
      .select('product_id')
      .eq('order_id', orderId)

    const existingProductIds = new Set((existingItems ?? []).map(i => i.product_id))

    const itemsToUpdate = items.filter((i: any) => existingProductIds.has(i.id))
    const itemsToInsert = items.filter((i: any) => !existingProductIds.has(i.id))

    for (const item of itemsToUpdate) {
      await supabase.from('order_items')
        .update({ qty: item.qty, price: item.price })
        .eq('order_id', orderId)
        .eq('product_id', item.id)
    }

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
      .insert({ client_id: clientId, status: 'pending', total })
      .select()
      .single()
    if (!order) return NextResponse.json({ error: 'Failed to create order' }, { status: 500 })
    orderId = (order as any).id
    await supabase.from('order_items').insert(
      items.map((i: any) => ({ order_id: orderId, product_id: i.id, qty: i.qty, price: i.price }))
    )
  }

  // Create/update reservations linked to the order
  for (const item of items) {
    const { data: existingRes } = await supabase
      .from('reservations')
      .select('qty')
      .eq('product_id', item.id)
      .eq('user_id', clientId)
      .single()

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

      const newQtyReserved = (stock?.qty_reserved ?? 0) + qtyChange
      await supabase
        .from('stock')
        .update({ qty_reserved: newQtyReserved })
        .eq('product_id', item.id)
    }
  }

  return NextResponse.json({ success: true, order_id: orderId, is_new_order: isNewOrder, expires_at })
}

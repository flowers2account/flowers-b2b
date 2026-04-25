import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { order_id } = await req.json()
  if (!order_id) return NextResponse.json({ error: 'Missing order_id' }, { status: 400 })

  // Get order (RLS will verify it belongs to user)
  const { data: order } = await supabase
    .from('orders')
    .select('id')
    .eq('id', order_id)
    .single()

  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  // Get order items to know which products to unreserve
  const { data: orderItems } = await supabase
    .from('order_items')
    .select('product_id')
    .eq('order_id', order_id)
  const productIds = (orderItems ?? []).map((i: any) => i.product_id)

  // Get reservations before deletion to calculate qty changes
  const { data: restoDelete } = await supabase
    .from('reservations')
    .select('product_id, qty')
    .eq('order_id', order_id)

  // Group by product_id to calculate total qty reduction
  const qtyByProduct = new Map<number, number>()
  for (const res of restoDelete ?? []) {
    const current = qtyByProduct.get(res.product_id) || 0
    qtyByProduct.set(res.product_id, current + res.qty)
  }

  // Delete reservations linked by order_id OR by user+product (fallback for older records)
  await supabase.from('reservations').delete().eq('order_id', order_id)
  if (productIds.length > 0) {
    await supabase.from('reservations').delete()
      .eq('user_id', user.id)
      .in('product_id', productIds)
  }

  // Update qty_reserved in stock for affected products
  for (const [productId, deletedQty] of qtyByProduct.entries()) {
    const { data: stock } = await supabase
      .from('stock')
      .select('qty_reserved')
      .eq('product_id', productId)
      .single()

    const newQtyReserved = Math.max(0, (stock?.qty_reserved ?? 0) - deletedQty)
    await supabase
      .from('stock')
      .update({ qty_reserved: newQtyReserved })
      .eq('product_id', productId)
  }

  const { error: updateError } = await supabase
    .from('orders')
    .update({ status: 'cancelled' })
    .eq('id', order_id)

  if (updateError) {
    return NextResponse.json({ error: 'Failed to cancel order' }, { status: 403 })
  }

  return NextResponse.json({ success: true })
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { item_id, qty } = await req.json()
  if (!item_id || qty == null) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  // Get item and verify order status
  const { data: item } = await supabase
    .from('order_items')
    .select('id, order_id, orders(id, status)')
    .eq('id', item_id)
    .single()

  if (!item) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 })
  }

  const orderData = (item as any)?.orders
  if (!['pending', 'reserved'].includes(orderData?.status)) {
    return NextResponse.json({ error: 'Order is not editable' }, { status: 403 })
  }

  const orderId = (item as any).order_id

  // Update item qty (RLS will verify ownership)
  const { error: updateError } = await supabase
    .from('order_items')
    .update({ qty })
    .eq('id', item_id)

  if (updateError) {
    return NextResponse.json({ error: 'Failed to update' }, { status: 403 })
  }

  // Recalculate total
  const { data: allItems } = await supabase
    .from('order_items')
    .select('qty, price')
    .eq('order_id', orderId)

  const newTotal = (allItems ?? []).reduce((sum: number, i: any) => sum + i.qty * i.price, 0)
  await supabase.from('orders').update({ total: newTotal }).eq('id', orderId)

  return NextResponse.json({ success: true, total: newTotal })
}

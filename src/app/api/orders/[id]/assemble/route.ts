import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params
  const orderId = parseInt(id)

  const { changed_by, items } = await req.json()
  if (!items?.length) return NextResponse.json({ error: 'Missing items' }, { status: 400 })

  const { data: order } = await supabase
    .from('orders')
    .select('status')
    .eq('id', orderId)
    .single()

  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  for (const item of items) {
    await supabase
      .from('order_items')
      .update({ qty_actual: item.qty_actual, is_removed: item.is_removed })
      .eq('id', item.id)
  }

  // Recalculate total from actual quantities
  const { data: updatedItems } = await supabase
    .from('order_items')
    .select('qty_actual, qty_ordered, price, is_removed')
    .eq('order_id', orderId)

  const newTotal = (updatedItems ?? [])
    .filter((i: any) => !i.is_removed)
    .reduce((sum: number, i: any) => sum + (i.qty_actual ?? i.qty_ordered) * i.price, 0)

  await supabase
    .from('orders')
    .update({ status: 'assembled', total: newTotal })
    .eq('id', orderId)

  await supabase.from('order_history').insert({
    order_id: orderId,
    status_from: order.status,
    status_to: 'assembled',
    changed_by: changed_by ?? null,
  })

  return NextResponse.json({ success: true })
}

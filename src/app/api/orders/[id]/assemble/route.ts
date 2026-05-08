import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params
  const orderId = Number(id)

  const { changed_by, assembly_photo_url, items } = await req.json()
  if (!items?.length) return NextResponse.json({ error: 'Missing items' }, { status: 400 })

  const { data: order } = await supabase
    .from('orders')
    .select('status')
    .eq('id', orderId)
    .single()

  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  for (const item of items) {
    const { error: itemError } = await supabase
      .from('order_items')
      .update({ qty_actual: item.qty_actual, is_removed: item.is_removed })
      .eq('id', item.id)
    if (itemError) console.log('ORDER_ITEM UPDATE ERROR:', itemError)
  }

  const { data: updatedItems, error: itemsSelectError } = await supabase
    .from('order_items')
    .select('qty_actual, qty_ordered, price, is_removed')
    .eq('order_id', orderId)

  if (itemsSelectError) console.log('ORDER_ITEMS SELECT ERROR:', itemsSelectError)

  const newTotal = (updatedItems ?? [])
    .filter((i: any) => !i.is_removed)
    .reduce((sum: number, i: any) => sum + (i.qty_actual ?? i.qty_ordered) * i.price, 0)

  const { error: updateError } = await supabase
    .from('orders')
    .update({
      status: 'assembled',
      total: newTotal,
      assembly_photo_url: assembly_photo_url ?? null,
      assembled_at: new Date().toISOString(),
      assembled_by: changed_by ?? null,
    })
    .eq('id', Number(id))

  console.log('UPDATE ERROR:', updateError)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  const { error: historyError } = await supabase.from('order_history').insert({
    order_id: orderId,
    status_from: order.status,
    status_to: 'assembled',
    changed_by: changed_by ?? null,
  })
  if (historyError) console.log('HISTORY INSERT ERROR:', historyError)

  return NextResponse.json({ success: true })
}

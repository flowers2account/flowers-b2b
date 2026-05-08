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

  const { status, changed_by } = await req.json()
  if (!status) return NextResponse.json({ error: 'Missing status' }, { status: 400 })

  const { data: order } = await supabase
    .from('orders')
    .select('status')
    .eq('id', orderId)
    .single()

  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { error: updateError } = await supabase
    .from('orders')
    .update({ status })
    .eq('id', orderId)

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  // For confirmed status, also run FIFO stock deduction
  if (status === 'confirmed') {
    const { error: rpcError } = await supabase.rpc('confirm_order_fifo', { p_order_id: orderId })
    if (rpcError) return NextResponse.json({ error: rpcError.message }, { status: 500 })
  }

  await supabase.from('order_history').insert({
    order_id: orderId,
    status_from: order.status,
    status_to: status,
    changed_by: changed_by ?? null,
  })

  return NextResponse.json({ success: true })
}

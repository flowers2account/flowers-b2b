import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { order_id } = await req.json()
  if (!order_id) return NextResponse.json({ error: 'Missing order_id' }, { status: 400 })

  const admin = createAdminClient()

  // Verify order belongs to this client
  const { data: order } = await admin
    .from('orders')
    .select('id, client_id')
    .eq('id', order_id)
    .single()

  if (!order || (order as any).client_id !== user.id) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  // Get order items to know which products to unreserve
  const { data: orderItems } = await admin
    .from('order_items')
    .select('product_id')
    .eq('order_id', order_id)
  const productIds = (orderItems ?? []).map((i: any) => i.product_id)

  // Delete reservations linked by order_id OR by user+product (fallback for older records)
  await admin.from('reservations').delete().eq('order_id', order_id)
  if (productIds.length > 0) {
    await admin.from('reservations').delete()
      .eq('user_id', user.id)
      .in('product_id', productIds)
  }

  await admin.from('orders').update({ status: 'cancelled' }).eq('id', order_id)

  return NextResponse.json({ success: true })
}

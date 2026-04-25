import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { item_id, qty } = await req.json()
  if (!item_id || qty == null) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const admin = createAdminClient()

  // Verify item belongs to an order owned by this client
  const { data: item } = await admin
    .from('order_items')
    .select('id, order_id, orders(id, client_id, status)')
    .eq('id', item_id)
    .single()

  const orderData = (item as any)?.orders
  if (!item || orderData?.client_id !== user.id) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 })
  }
  if (!['pending', 'reserved'].includes(orderData?.status)) {
    return NextResponse.json({ error: 'Order is not editable' }, { status: 403 })
  }

  const orderId = (item as any).order_id

  await admin.from('order_items').update({ qty }).eq('id', item_id)

  // Recalculate total
  const { data: allItems } = await admin
    .from('order_items')
    .select('qty, price')
    .eq('order_id', orderId)

  const newTotal = (allItems ?? []).reduce((sum: number, i: any) => sum + i.qty * i.price, 0)
  await admin.from('orders').update({ total: newTotal }).eq('id', orderId)

  return NextResponse.json({ success: true, total: newTotal })
}

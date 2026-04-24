import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { order_id } = await req.json()
  if (!order_id) return NextResponse.json({ error: 'Missing order_id' }, { status: 400 })

  // Проверяем что заказ принадлежит клиенту
  const { data: order } = await supabase
    .from('orders')
    .select('id')
    .eq('id', order_id)
    .eq('client_id', user.id)
    .single()

  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

  // Удаляем резервы привязанные к заказу
  await supabase.from('reservations').delete().eq('order_id', order_id)

  // Меняем статус на cancelled
  await supabase.from('orders').update({ status: 'cancelled' }).eq('id', order_id)

  return NextResponse.json({ success: true })
}

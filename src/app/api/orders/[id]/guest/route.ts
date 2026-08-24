import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyOrderAccessToken } from '@/lib/order-access-token'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const orderId = parseInt((await params).id, 10)
  if (!Number.isFinite(orderId)) return NextResponse.json({ error: 'bad id' }, { status: 400 })

  const token = req.headers.get('x-order-access-token') || req.nextUrl.searchParams.get('token')
  const access = verifyOrderAccessToken(token, orderId)
  if (!access) return NextResponse.json({ error: 'Нет доступа' }, { status: 401 })

  const sb = createAdminClient()
  const { data: order, error } = await sb
    .from('orders')
    .select(`
      id,
      status,
      payment_status,
      total,
      notes,
      payment_method,
      created_at,
      paid_at,
      confirmed_at,
      assembled_at,
      assembly_photo_url,
      delivery_cost,
      delivery_city,
      client_id,
      order_items (
        id,
        qty,
        qty_ordered,
        qty_actual,
        is_removed,
        price,
        color,
        product:products ( id, name, display_name, image_url )
      )
    `)
    .eq('id', orderId)
    .eq('client_id', access.clientId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!order) return NextResponse.json({ error: 'Заказ не найден' }, { status: 404 })

  const { data: client } = await sb
    .from('clients')
    .select('id, name, phone, company_name, bin, city')
    .eq('id', access.clientId)
    .maybeSingle()

  return NextResponse.json({
    order,
    client: client
      ? { id: client.id, name: client.name, phone: client.phone, company_name: client.company_name, bin: client.bin, city: client.city }
      : null,
  })
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { normalizePhone } from '@/lib/phone'
import { getAuthedUser } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  // Владелец резолвится ИЗ токена, phone из query игнорируется (защита от IDOR)
  const authed = await getAuthedUser(req)
  if (!authed?.phone) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const supabase = await createClient()

  const normalizedPhone = normalizePhone(authed.phone)
  const { data: client } = await supabase
    .from('clients')
    .select('id, name, phone')
    .eq('phone', normalizedPhone)
    .maybeSingle()

  if (!client) return NextResponse.json({ orders: [] })

  const { data: orders } = await supabase
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
      order_items (
        id,
        qty,
        qty_ordered,
        qty_actual,
        is_removed,
        price,
        product:products ( id, name, display_name )
      )
    `)
    .eq('client_id', client.id)
    .order('created_at', { ascending: false })

  return NextResponse.json({
    client: { name: client.name, phone: client.phone },
    orders: orders ?? [],
  })
}
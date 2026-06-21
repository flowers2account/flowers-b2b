import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizePhone } from '@/lib/phone'
import { getAuthedUser } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  // Владелец резолвится ИЗ токена, phone из query игнорируется (защита от IDOR)
  const authed = await getAuthedUser(req)
  if (!authed?.phone) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  // RLS step 1: admin-клиент вместо anon (доступ уже закрыт токен-проверкой выше)
  const supabase = createAdminClient()

  const normalizedPhone = normalizePhone(authed.phone)
  const { data: client } = await supabase
    .from('clients')
    .select('id, name, phone, company_name, bin')
    .eq('phone', normalizedPhone)
    .maybeSingle()

  if (!client) return NextResponse.json({ client: null, orders: [] })

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
        color,
        product:products ( id, name, display_name, image_url )
      )
    `)
    .eq('client_id', client.id)
    .order('created_at', { ascending: false })

  return NextResponse.json({
    client: { id: client.id, name: client.name, phone: client.phone, company_name: client.company_name, bin: client.bin },
    orders: orders ?? [],
  })
}
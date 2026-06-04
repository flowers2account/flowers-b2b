import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { normalizePhone } from '@/lib/phone'

export async function GET(req: NextRequest) {
  const phone = req.nextUrl.searchParams.get('phone')
  if (!phone) return NextResponse.json({ error: 'phone is required' }, { status: 400 })

  const supabase = await createClient()

  const normalizedPhone = normalizePhone(phone)
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
      created_at,
      assembly_photo_url,
      order_items (
        id,
        qty,
        qty_ordered,
        qty_actual,
        is_removed,
        price,
        product:products ( name, display_name )
      )
    `)
    .eq('client_id', client.id)
    .order('created_at', { ascending: false })

  return NextResponse.json({
    client: { name: client.name, phone: client.phone },
    orders: orders ?? [],
  })
}
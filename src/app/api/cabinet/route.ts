import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const phone = req.nextUrl.searchParams.get('phone')
  if (!phone) {
    return NextResponse.json({ error: 'phone is required' }, { status: 400 })
  }

  const supabase = await createClient()

  const { data: client } = await supabase
    .from('clients')
    .select('id, name, phone')
    .eq('phone', phone)
    .maybeSingle()

  if (!client) {
    return NextResponse.json({ orders: [] })
  }

  const { data: orders } = await supabase
    .from('orders')
    .select(`
      id,
      status,
      created_at,
      order_items (
        id,
        quantity,
        price,
        product:products ( name )
      )
    `)
    .eq('client_id', client.id)
    .order('created_at', { ascending: false })

  return NextResponse.json({
    client: { name: client.name, phone: client.phone },
    orders: orders ?? [],
  })
}

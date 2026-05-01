import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { normalizePhone } from '@/lib/phone'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('phone').eq('id', user.id).single()
  if (!profile?.phone) return NextResponse.json([])

  const { data: client } = await supabase.from('clients').select('id').eq('phone', normalizePhone(profile.phone)).maybeSingle()
  if (!client) return NextResponse.json([])

  const { data, error } = await supabase
    .from('orders')
    .select(`
      id, status, total, notes, created_at, client_id,
      order_items(id, product_id, qty, price, product:product_id(name, pack_size, stock:stock_available(available_qty))),
      reservations(expires_at)
    `)
    .eq('client_id', client.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

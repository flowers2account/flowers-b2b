import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { product_id, qty } = await req.json()
  if (!product_id || !qty) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  // Используем service role для обхода RLS
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const expires_at = new Date(Date.now() + 30 * 60 * 1000).toISOString()

  const { data: stock } = await admin
    .from('stock')
    .select('qty, qty_reserved')
    .eq('product_id', product_id)
    .single()

  if (!stock) return NextResponse.json({ error: 'Product not found', product_id, env_url: !!process.env.NEXT_PUBLIC_SUPABASE_URL, env_key: !!process.env.SUPABASE_SERVICE_ROLE_KEY }, { status: 404 })

  const { data: activeReservations } = await admin
    .from('reservations')
    .select('qty')
    .eq('product_id', product_id)
    .gt('expires_at', new Date().toISOString())
    .neq('user_id', user.id)

  const othersReserved = (activeReservations ?? []).reduce((s, r) => s + r.qty, 0)
  const available = stock.qty - stock.qty_reserved - othersReserved

  if (qty > available) {
    return NextResponse.json({ error: 'Insufficient stock', available }, { status: 409 })
  }

  await admin.from('reservations')
    .delete()
    .eq('product_id', product_id)
    .eq('user_id', user.id)

  if (qty === 0) {
    return NextResponse.json({ success: true })
  }

  const { error } = await admin.from('reservations').insert({
    product_id,
    qty,
    user_id: user.id,
    expires_at,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, expires_at })
}

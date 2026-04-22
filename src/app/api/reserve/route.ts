import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createPublicClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { product_id, qty } = await req.json()
  if (!product_id || !qty) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const publicClient = createPublicClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const expires_at = new Date(Date.now() + 30 * 60 * 1000).toISOString()

  const { data: stock } = await publicClient
    .from('stock')
    .select('qty, qty_reserved')
    .eq('product_id', product_id)
    .single()

  if (!stock) return NextResponse.json({ error: 'Product not found', product_id }, { status: 404 })

  const available = stock.qty - stock.qty_reserved

  if (qty > available) {
    return NextResponse.json({ error: 'Insufficient stock', available }, { status: 409 })
  }

  await supabase.from('reservations').delete()
    .eq('product_id', product_id).eq('user_id', user.id)

  if (qty > 0) {
    await supabase.from('reservations').insert({
      product_id, qty, user_id: user.id, expires_at,
    })
  }

  return NextResponse.json({ success: true, expires_at })
}

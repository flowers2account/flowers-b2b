import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { product_id, qty } = await req.json()
  if (!product_id || !qty) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const expires_at = new Date(Date.now() + 30 * 60 * 1000).toISOString()

  // Проверяем доступный остаток
  const { data: stock } = await supabase
    .from('stock')
    .select('qty, qty_reserved')
    .eq('product_id', product_id)
    .single()

  if (!stock) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

  // Считаем активные резервы других пользователей
  const { data: activeReservations } = await supabase
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

  // Удаляем старый резерв этого пользователя на этот товар
  await supabase.from('reservations')
    .delete()
    .eq('product_id', product_id)
    .eq('user_id', user.id)

  if (qty === 0) {
    return NextResponse.json({ success: true })
  }

  // Создаём новый резерв
  const { error } = await supabase.from('reservations').insert({
    product_id,
    qty,
    user_id: user.id,
    expires_at,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, expires_at })
}

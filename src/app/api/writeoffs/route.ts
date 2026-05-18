import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const admin = createAdminClient()

async function authorizeUser(userId: string | undefined) {
  if (!userId) return { ok: false, error: 'userId не передан' }

  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single()

  if (!profile) return { ok: false, error: 'Профиль не найден' }
  if (!['admin', 'manager'].includes(profile.role)) {
    return { ok: false, error: `Нет доступа (роль: ${profile.role})` }
  }
  return { ok: true, error: null }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { product_id, quantity, reason, photo_url, userId } = body

  const { ok, error: authError } = await authorizeUser(userId)
  if (!ok) {
    return NextResponse.json({ error: authError }, { status: 403 })
  }

  if (!product_id || !quantity || quantity <= 0) {
    return NextResponse.json({ error: 'Invalid product_id or quantity' }, { status: 400 })
  }

  const { data: stock, error: stockError } = await admin
    .from('stock')
    .select('qty, qty_reserved')
    .eq('product_id', product_id)
    .single()

  if (stockError || !stock) {
    return NextResponse.json({ error: 'Product not found in stock' }, { status: 404 })
  }

  const available = stock.qty - stock.qty_reserved
  if (available < quantity) {
    return NextResponse.json({ error: `Недостаточно: доступно ${available} шт` }, { status: 400 })
  }

  const { data: writeoff, error: writeoffError } = await admin
    .from('writeoffs')
    .insert({ product_id, quantity, reason: reason || null, photo_url: photo_url || null, created_by: userId })
    .select()
    .single()

  if (writeoffError || !writeoff) {
    console.error('Writeoff insert error:', writeoffError)
    return NextResponse.json({ error: 'Ошибка создания списания' }, { status: 500 })
  }

  const { error: stockUpdateError } = await admin
    .from('stock')
    .update({ qty: stock.qty - quantity, updated_at: new Date().toISOString() })
    .eq('product_id', product_id)

  if (stockUpdateError) {
    await admin.from('writeoffs').delete().eq('id', writeoff.id)
    return NextResponse.json({ error: 'Ошибка обновления остатка' }, { status: 500 })
  }

  await admin.from('inventory_ledger').insert({
    product_id,
    action: 'writeoff',
    quantity: -quantity,
    qty_before: stock.qty,
    qty_after: stock.qty - quantity,
    reference_type: 'writeoff',
    reference_id: Number(writeoff.id),
    created_by: userId,
    notes: reason || null,
  })

  return NextResponse.json({ success: true, data: writeoff })
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId') || undefined

  const { ok, error: authError } = await authorizeUser(userId)
  if (!ok) {
    return NextResponse.json({ error: authError }, { status: 403 })
  }

  const from = searchParams.get('from')
  const to   = searchParams.get('to')

  let query = admin
    .from('writeoffs')
    .select(`*, products(name, variety_name, length_str), profiles(full_name, display_name)`)
    .order('created_at', { ascending: false })
    .limit(100)

  if (from) query = query.gte('created_at', from)
  if (to)   query = query.lte('created_at', to)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, data })
}

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const admin = createAdminClient()

async function authorizeUser(userId: string | undefined) {
  if (!userId) return { ok: false, error: 'userId не передан' }
  const { data: profile } = await admin.from('profiles').select('role').eq('id', userId).single()
  if (!profile) return { ok: false, error: 'Профиль не найден' }
  if (!['admin', 'manager'].includes(profile.role)) return { ok: false, error: 'Нет доступа' }
  return { ok: true, error: null }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { session_id, product_id, count, userId } = body

  const { ok, error: authError } = await authorizeUser(userId)
  if (!ok) return NextResponse.json({ error: authError }, { status: 403 })

  if (!session_id || !product_id || typeof count !== 'number' || count <= 0) {
    return NextResponse.json({ error: 'Неверные параметры' }, { status: 400 })
  }

  const { data: existing } = await admin
    .from('inventory_counts')
    .select('*')
    .eq('session_id', session_id)
    .eq('product_id', product_id)
    .maybeSingle()

  if (existing) {
    const newCounts = [...existing.counts, count]
    const newTotal = newCounts.reduce((a: number, b: number) => a + b, 0)

    const { data, error } = await admin
      .from('inventory_counts')
      .update({ counts: newCounts, total_counted: newTotal })
      .eq('id', existing.id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  }

  const { data: stockRow } = await admin
    .from('stock_available')
    .select('qty')
    .eq('product_id', product_id)
    .maybeSingle()

  const system_stock = stockRow?.qty ?? 0

  const { data, error } = await admin
    .from('inventory_counts')
    .insert({ session_id, product_id, counts: [count], total_counted: count, system_stock })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

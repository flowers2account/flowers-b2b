export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthedWithRole } from '@/lib/api-auth'

export async function POST(req: NextRequest) {
  const authed = await getAuthedWithRole(req, ['admin', 'manager'])
  if (!authed) return NextResponse.json({ error: 'Доступ запрещён' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { rowId, productId, action = 'match', userId } = body
  // action: 'match' | 'skip' | 'unmatch'

  if (!rowId) return NextResponse.json({ error: 'rowId required' }, { status: 400 })

  const supabase = await createClient()

  if (action === 'skip') {
    await supabase.from('stock_import_rows')
      .update({ status: 'skipped', matched_product_id: null, match_source: null })
      .eq('id', rowId)
    return NextResponse.json({ ok: true })
  }

  if (action === 'unmatch') {
    await supabase.from('stock_import_rows')
      .update({ status: 'unmatched', matched_product_id: null, match_source: null })
      .eq('id', rowId)
    return NextResponse.json({ ok: true })
  }

  // action === 'match'
  if (!productId) return NextResponse.json({ error: 'productId required for match' }, { status: 400 })

  const { data: row } = await supabase
    .from('stock_import_rows')
    .select('norm_name, raw_name')
    .eq('id', rowId)
    .single()

  if (!row) return NextResponse.json({ error: 'Row not found' }, { status: 404 })

  await supabase.from('stock_import_rows').update({
    matched_product_id: productId,
    status: 'matched',
    match_source: 'manual',
  }).eq('id', rowId)

  // Upsert alias so future imports match automatically
  await supabase.from('stock_aliases').upsert({
    norm_name: row.norm_name,
    raw_name: row.raw_name,
    product_id: productId,
    created_by: userId ?? null,
  }, { onConflict: 'norm_name' })

  return NextResponse.json({ ok: true })
}

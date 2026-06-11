export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthedWithRole } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  const authed = await getAuthedWithRole(req, ['admin', 'manager'])
  if (!authed) return NextResponse.json({ error: 'Доступ запрещён' }, { status: 403 })

  const importId = req.nextUrl.searchParams.get('importId')
  if (!importId) return NextResponse.json({ error: 'importId required' }, { status: 400 })

  const supabase = await createClient()

  const { data: rows, error } = await supabase
    .from('stock_import_rows')
    .select('*')
    .eq('import_id', parseInt(importId))
    .order('status') // unmatched first (alphabetical: matched < skipped < unmatched)
    .order('raw_name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Enrich with product info for matched rows
  const productIds = [...new Set(
    (rows ?? []).filter(r => r.matched_product_id).map(r => r.matched_product_id as number)
  )]

  let productMap: Record<number, { id: number; name: string; display_name: string | null; length_cm: number | null; subcategory: string | null; image_url: string | null; colors: string[] | null }> = {}

  if (productIds.length > 0) {
    const { data: products } = await supabase
      .from('products')
      .select('id, name, display_name, length_cm, subcategory, image_url, colors')
      .in('id', productIds)
    for (const p of products ?? []) productMap[p.id] = p
  }

  const enriched = (rows ?? []).map(r => ({
    ...r,
    product: r.matched_product_id ? (productMap[r.matched_product_id] ?? null) : null,
  }))

  // Sort: unmatched first, then matched, then skipped/applied
  const ORDER: Record<string, number> = { unmatched: 0, matched: 1, skipped: 2, applied: 3 }
  enriched.sort((a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9) || a.raw_name.localeCompare(b.raw_name, 'ru'))

  const summary = {
    total: enriched.length,
    unmatched: enriched.filter(r => r.status === 'unmatched').length,
    matched: enriched.filter(r => r.status === 'matched').length,
    skipped: enriched.filter(r => r.status === 'skipped').length,
    applied: enriched.filter(r => r.status === 'applied').length,
  }

  return NextResponse.json({ rows: enriched, summary })
}

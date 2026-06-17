export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseNomenclature } from '@/lib/parse-nomenclature'
import { getAuthedWithRole } from '@/lib/api-auth'

export async function POST(req: NextRequest) {
  const authed = await getAuthedWithRole(req, ['admin', 'manager'])
  if (!authed) return NextResponse.json({ error: 'Доступ запрещён' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { rowId } = body

  if (!rowId) return NextResponse.json({ error: 'rowId required' }, { status: 400 })

  const supabase = createAdminClient()

  const { data: row, error: rowErr } = await supabase
    .from('stock_import_rows')
    .select('*')
    .eq('id', rowId)
    .single()

  if (rowErr || !row) return NextResponse.json({ error: 'Row not found' }, { status: 404 })
  if (row.status === 'applied') return NextResponse.json({ error: 'Row already applied' }, { status: 400 })

  const parsed = parseNomenclature(row.raw_name)

  const newProduct: Record<string, unknown> = {
    name: row.raw_name,
    category: row.file_category ?? 'cut',
    source: '1c_manual',
    qty: row.qty,
    price: row.price,
    is_active: true,
    arrival_date: new Date().toISOString().slice(0, 10),
  }

  if (row.enriched_subcategory)  newProduct.subcategory   = row.enriched_subcategory
  if (row.enriched_variety_type) newProduct.variety_type  = row.enriched_variety_type
  if (row.enriched_colors?.length) newProduct.colors      = row.enriched_colors
  if (row.enriched_country_iso)  newProduct.country_iso   = row.enriched_country_iso
  if (row.enriched_display_name) newProduct.display_name  = row.enriched_display_name
  if (row.file_country && !row.enriched_country_iso) newProduct.country_iso = row.file_country
  if (parsed.length_cm !== null) newProduct.length_cm     = parsed.length_cm

  const { data: created, error: insErr } = await supabase
    .from('products')
    .insert(newProduct)
    .select('id, name, display_name, length_cm, subcategory, image_url, colors')
    .single()

  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  // Create alias so future imports find this product by raw_name
  const normName = (row.norm_name ?? row.raw_name.toLowerCase().trim().replace(/\s+/g, ' '))
  await supabase.from('stock_aliases').upsert(
    { norm_name: normName, raw_name: row.raw_name, product_id: created.id },
    { onConflict: 'norm_name' }
  )

  // Mark row as matched with the new product
  await supabase.from('stock_import_rows').update({
    matched_product_id: created.id,
    status: 'matched',
    match_source: '1c_manual',
  }).eq('id', rowId)

  return NextResponse.json({ product: created })
}

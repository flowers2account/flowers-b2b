export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function generateAccessCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

interface StagingRow {
  product_id: number | null
  oz_line_id: string | null
  oz_stock_type: string | null
  oz_delivery_date: string | null
  available_stems: number | null
  order_multiple_stems: number | null
  purchase_eur: number | null
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['admin', 'manager'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { campaign_id, markup_percent, eur_kzt_rate, round_to } = await req.json()
  if (!campaign_id) return NextResponse.json({ error: 'campaign_id required' }, { status: 400 })

  // Read defaults from app_settings if not provided
  const { data: settings } = await supabase
    .from('app_settings')
    .select('key, value')
    .in('key', ['preorder_markup_percent', 'preorder_eur_kzt_rate', 'preorder_round_to'])

  const settingsMap = Object.fromEntries(
    ((settings ?? []) as { key: string; value: string }[]).map(s => [s.key, s.value])
  )
  const markup  = markup_percent  ?? parseFloat(settingsMap.preorder_markup_percent ?? '35')
  const rate    = eur_kzt_rate    ?? parseFloat(settingsMap.preorder_eur_kzt_rate   ?? '525')
  const roundTo = round_to        ?? parseFloat(settingsMap.preorder_round_to       ?? '1')

  // Get selected staging rows
  const { data: stagingRows, error: stagingErr } = await supabase
    .from('campaign_staging')
    .select('*')
    .eq('campaign_id', campaign_id)
    .eq('is_selected', true)

  if (stagingErr) return NextResponse.json({ error: stagingErr.message }, { status: 500 })
  if (!stagingRows?.length) return NextResponse.json({ error: 'Нет выбранных строк в стейджинге' }, { status: 400 })

  // Build campaign_items from selected staging rows
  const items = (stagingRows as StagingRow[]).map((row, i) => ({
    campaign_id:        campaign_id,
    product_id:         row.product_id,
    pack_size:          row.order_multiple_stems ?? 1,
    min_qty:            row.order_multiple_stems ?? 1,
    sort_order:         i + 1,
    is_active:          true,
    oz_line_id:         row.oz_line_id,
    oz_stock_type:      row.oz_stock_type,
    oz_delivery_date:   row.oz_delivery_date,
    oz_available_stems: row.available_stems,
    oz_purchase_eur:    row.purchase_eur,
    markup_percent:     markup,
    eur_kzt_rate:       rate,
    // price = calc_preorder_price_kzt called via SQL below
  }))

  // Insert campaign_items + calculate prices via DB function
  let inserted = 0
  const errorLog: string[] = []

  for (const item of items) {
    if (!item.oz_purchase_eur) {
      errorLog.push(`Строка без purchase_eur: oz_line_id=${item.oz_line_id}`)
      continue
    }

    const { data: priceRow } = await supabase
      .rpc('calc_preorder_price_kzt', {
        purchase_eur: item.oz_purchase_eur,
        markup_pct:   item.markup_percent,
        rate:         item.eur_kzt_rate,
        round_to:     roundTo,
      })

    const { error } = await supabase
      .from('campaign_items')
      .insert({ ...item, price: priceRow ?? 0 })

    if (error) errorLog.push(`oz_line_id=${item.oz_line_id}: ${error.message}`)
    else inserted++
  }

  // Publish campaign + freeze markup/rate + generate access_code
  const access_code = generateAccessCode()
  await supabase
    .from('campaigns')
    .update({
      status:         'published',
      markup_percent: markup,
      eur_kzt_rate:   rate,
      access_code,
    })
    .eq('id', campaign_id)

  return NextResponse.json({ inserted, errors: errorLog.length, errorLog, access_code })
}

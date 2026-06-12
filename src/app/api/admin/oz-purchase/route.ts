export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthedWithRole } from '@/lib/api-auth'

/**
 * Данные раздела /admin/oz-purchase («Закуп с ОЗ», read-only).
 * Все oz_catalog-карточки (активные и нет) + настройки цены + статус ночного
 * парсера (см. docs/OZ_PRICE_REFRESH.md). Фильтры/сортировки — на клиенте.
 */
export async function GET(req: NextRequest) {
  const authed = await getAuthedWithRole(req, ['admin'])
  if (!authed) return NextResponse.json({ error: 'Доступ запрещён' }, { status: 403 })

  const supabase = createAdminClient()

  // карточки — пагинация (PostgREST max_rows=1000, всего ~1334)
  type Row = Record<string, unknown>
  const products: Row[] = []
  for (let from = 0; ; from += 1000) {
    const { data: page, error } = await supabase
      .from('products')
      .select('id, name, display_name, length_cm, farm, subcategory, image_url, qty, is_active, oz_purchase_eur, oz_stock_updated_at, source_url')
      .eq('source', 'oz_catalog')
      .order('id')
      .range(from, from + 999)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!page || page.length === 0) break
    products.push(...page)
    if (page.length < 1000) break
  }

  // настройки цены (формула calc_preorder_price_kzt повторяется на клиенте)
  const { data: settingsRows } = await supabase
    .from('app_settings')
    .select('key, value, updated_at')
    .in('key', ['preorder_markup_percent', 'preorder_eur_kzt_rate', 'preorder_round_to'])
  const settings: Record<string, { value: string; updated_at: string | null }> = {}
  for (const s of settingsRows ?? []) settings[s.key] = { value: s.value, updated_at: s.updated_at }

  // статус последнего прогона: max(oz_stock_updated_at) + сколько карточек в том же прогоне
  // (прогон идёт ~1–1.5 ч — берём окно 3 ч от максимума)
  let lastRun: { at: string; updated: number } | null = null
  const stamps = products
    .map(p => p.oz_stock_updated_at as string | null)
    .filter((s): s is string => !!s)
    .sort()
  if (stamps.length > 0) {
    const maxAt = stamps[stamps.length - 1]
    const windowStart = new Date(new Date(maxAt).getTime() - 3 * 3600_000).toISOString()
    const updated = stamps.filter(s => s >= windowStart).length
    lastRun = { at: maxAt, updated }
  }

  return NextResponse.json({ products, settings, lastRun })
}

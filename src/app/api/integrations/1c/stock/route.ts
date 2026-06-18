export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Приёмник ПОЛНОГО СНИМКА остатков из 1С → staging `stock_import_rows`.
 * Витрину (`products`) НЕ трогает: данные ложатся в буфер и применяются вручную
 * через /admin/import (маппинг → apply). Пишет service-role клиентом (RLS не мешает).
 *
 * Авторизация: заголовок `X-Integration-Secret` === env `INTEGRATION_1C_SECRET`.
 *
 * Тело JSON:
 *   { source: "1c-ip"|"1c-too", warehouse: string, price_type: string,
 *     category?: "cut"|"pot"|"accessories",
 *     items: [{ code_1c: string, name: string, qty: number, price: number, unit?: string }] }
 *
 * category опциональна; без неё file_category=NULL (НЕ дефолт 'cut') —
 * это блокирует категориальную деактивацию (finalize) на стороне apply.
 */

const SOURCES = new Set(['1c-ip', '1c-too'])
const CATEGORIES = new Set(['cut', 'pot', 'accessories'])
const MAX_ITEMS = 20000

/** lower + trim + схлоп пробелов — как norm_stock_name() / normName в import-xls */
function normName(s: string): string {
  return (s ?? '').toLowerCase().trim().replace(/\s+/g, ' ')
}

export async function POST(req: NextRequest) {
  // 1) секрет
  const secret = req.headers.get('x-integration-secret')
  const expected = process.env.INTEGRATION_1C_SECRET
  if (!expected || !secret || secret !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2) тело
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { source, warehouse, price_type, category, items } = body ?? {}

  if (typeof source !== 'string' || !SOURCES.has(source)) {
    return NextResponse.json({ error: 'Unknown source (ожидается "1c-ip" или "1c-too")' }, { status: 422 })
  }
  if (category != null && !CATEGORIES.has(category)) {
    return NextResponse.json({ error: 'Unknown category (ожидается "cut", "pot" или "accessories")' }, { status: 422 })
  }
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'items пуст или не массив' }, { status: 422 })
  }
  if (items.length > MAX_ITEMS) {
    return NextResponse.json({ error: `Слишком много позиций (> ${MAX_ITEMS})` }, { status: 413 })
  }

  // 3) сборка строк снимка
  const importId = Date.now()
  const rows: Array<Record<string, unknown>> = []
  let skipped = 0
  for (const it of items) {
    const code_1c = String(it?.code_1c ?? '').trim()
    const name = String(it?.name ?? '').trim()
    if (!code_1c || !name) { skipped++; continue }
    const qtyN = Number(it?.qty)
    const priceN = Number(it?.price)
    rows.push({
      import_id: importId,
      source,
      code_1c,
      raw_name: name,
      norm_name: normName(name),
      qty: Number.isFinite(qtyN) ? qtyN : 0,
      price: Number.isFinite(priceN) ? priceN : 0,
      status: 'unmatched',
      // явный NULL, иначе сработает column default 'cut' и finalize сможет обнулить срезку
      file_category: category ?? null,
    })
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: 'нет валидных позиций (нужны code_1c и name)' }, { status: 422 })
  }

  const supabase = createAdminClient()

  // 3b) автоматч с ИЗОЛЯЦИЕЙ по категории (защита от пересечения контуров):
  //   1c-ip  → только products category='accessories' (расходка)
  //   1c-too → только products category IN ('cut','pot') (цветы/горшечные)
  // Цветочная строка не привяжется к карточке расходки даже при совпадении имени/кода.
  const allowedCats = source === '1c-too' ? ['cut', 'pot'] : ['accessories']

  // alias (norm → product_id): принимаем только если товар нужной категории
  const norms = [...new Set(rows.map(r => r.norm_name as string))]
  const { data: aliases } = await supabase
    .from('stock_aliases').select('norm_name, product_id').in('norm_name', norms)
  const aliasPids = [...new Set((aliases ?? []).map(a => a.product_id))]
  const aliasCatOk = new Set<number>()
  for (let i = 0; i < aliasPids.length; i += 500) {
    const { data } = await supabase
      .from('products').select('id').in('id', aliasPids.slice(i, i + 500)).in('category', allowedCats)
    for (const p of data ?? []) aliasCatOk.add(p.id)
  }
  const aliasByNorm = new Map<string, number>()
  for (const a of aliases ?? []) if (aliasCatOk.has(a.product_id)) aliasByNorm.set(a.norm_name, a.product_id)

  // Приоритетный матч по артикулу 1С (products.code_1c) — только среди нужной категории.
  const codes = [...new Set(rows.map(r => r.code_1c as string).filter(Boolean))]
  const productByCode = new Map<string, number>()
  for (let i = 0; i < codes.length; i += 1000) {
    const { data } = await supabase
      .from('products').select('id, code_1c').in('code_1c', codes.slice(i, i + 1000)).in('category', allowedCats)
    for (const p of data ?? []) {
      if (p.code_1c && !productByCode.has(p.code_1c)) productByCode.set(p.code_1c, p.id)
    }
  }

  // exact name (norm) — только среди нужной категории.
  // ⚠️ PostgREST max_rows=1000 — без пагинации карта имён неполная и матч молча теряется
  const productByNorm = new Map<string, number>()
  for (let from = 0; ; from += 1000) {
    const { data: page } = await supabase
      .from('products').select('id, name').in('category', allowedCats).order('id').range(from, from + 999)
    if (!page || page.length === 0) break
    for (const p of page) {
      const n = normName(p.name)
      if (!productByNorm.has(n)) productByNorm.set(n, p.id)
    }
    if (page.length < 1000) break
  }

  // Приоритет матча: code_1c (точный артикул) → alias (norm) → exact products.name (norm)
  let matched = 0
  for (const r of rows) {
    const code = r.code_1c as string
    const n = r.norm_name as string
    if (code && productByCode.has(code)) {
      r.matched_product_id = productByCode.get(code)!
      r.status = 'matched'
      r.match_source = 'code_1c'
      matched++
    } else if (aliasByNorm.has(n)) {
      r.matched_product_id = aliasByNorm.get(n)!
      r.status = 'matched'
      r.match_source = 'alias'
      matched++
    } else if (productByNorm.has(n)) {
      r.matched_product_id = productByNorm.get(n)!
      r.status = 'matched'
      r.match_source = 'exact_name'
      matched++
    }
  }

  // 4) вставка нового снимка (чанками по 1000)
  let written = 0
  for (let i = 0; i < rows.length; i += 1000) {
    const chunk = rows.slice(i, i + 1000)
    const { error } = await supabase.from('stock_import_rows').insert(chunk)
    if (error) {
      console.error(`[1c/stock] insert error source=${source}:`, error.message)
      return NextResponse.json({ error: 'DB insert failed', detail: error.message }, { status: 500 })
    }
    written += chunk.length
  }

  // 5) полный снимок: прежние строки ЭТОГО source (не из текущей выгрузки, ещё не применённые)
  //    помечаем superseded — чтобы остатки отсутствующих в новом снимке позиций не «зависали».
  const { error: supErr } = await supabase
    .from('stock_import_rows')
    .update({ status: 'superseded' })
    .eq('source', source)
    .neq('import_id', importId)
    .not('status', 'in', '(applied,superseded)')
  if (supErr) console.error(`[1c/stock] supersede warn source=${source}:`, supErr.message)

  console.log(
    `[1c/stock] source=${source} warehouse=${warehouse ?? '-'} price_type=${price_type ?? '-'} ` +
    `category=${category ?? '-'} received=${items.length} written=${written} matched=${matched} ` +
    `unmatched=${written - matched} skipped=${skipped} import_id=${importId}`
  )

  return NextResponse.json({
    ok: true, import_id: importId,
    received: items.length, written,
    matched, unmatched: written - matched,
  })
}

// только POST
export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
}

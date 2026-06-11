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
 *     items: [{ code_1c: string, name: string, qty: number, price: number, unit?: string }] }
 */

const SOURCES = new Set(['1c-ip', '1c-too'])
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

  const { source, warehouse, price_type, items } = body ?? {}

  if (typeof source !== 'string' || !SOURCES.has(source)) {
    return NextResponse.json({ error: 'Unknown source (ожидается "1c-ip" или "1c-too")' }, { status: 422 })
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
    })
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: 'нет валидных позиций (нужны code_1c и name)' }, { status: 422 })
  }

  const supabase = createAdminClient()

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
    `received=${items.length} written=${written} skipped=${skipped} import_id=${importId}`
  )

  return NextResponse.json({ ok: true, import_id: importId, received: items.length, written })
}

// только POST
export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
}

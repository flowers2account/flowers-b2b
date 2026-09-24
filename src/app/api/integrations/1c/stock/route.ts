export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Приёмник ПОЛНОГО СНИМКА остатков из 1С → staging `stock_import_rows`.
 * Сматченные (по code_1c/alias/имени) позиции применяются к витрине (`products`)
 * АВТОМАТИЧЕСКИ и синхронно для ОБОИХ источников — 1c-ip (accessories) через RPC
 * `apply_1c_snapshot`, 1c-too (cut/pot) через applyCutPotSnapshot() ниже (та же
 * логика "зеркала склада", один в один, воспроизведена в TS, т.к. RPC жёстко
 * заточена под category='accessories'). Несматченные строки остаются в staging
 * и ждут ручной привязки через /admin/import (маппинг → apply). Пишет
 * service-role клиентом (RLS не мешает).
 *
 * Авторизация: заголовок `X-Integration-Secret` === env `INTEGRATION_1C_SECRET`.
 *
 * Тело JSON:
 *   { source: "1c-ip"|"1c-too", warehouse: string, price_type: string,
 *     category?: "cut"|"pot"|"accessories",
 *     items: [{ code_1c: string, name: string, qty: number, price: number, unit?: string }] }
 *
 * category опциональна; без неё file_category=NULL (НЕ дефолт 'cut') —
 * это блокирует категориальную деактивацию (finalize) на стороне ручного apply
 * (актуально только для несматченных строк — сматченные применяются автоматом здесь).
 */

const SOURCES = new Set(['1c-ip', '1c-too'])
const CATEGORIES = new Set(['cut', 'pot', 'accessories'])
const MAX_ITEMS = 20000

/** lower + trim + схлоп пробелов — как norm_stock_name() / normName в import-xls */
function normName(s: string): string {
  return (s ?? '').toLowerCase().trim().replace(/\s+/g, ' ')
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/**
 * Зеркало склада для cut/pot (1c-too) — то же самое, что делает RPC apply_1c_snapshot
 * для accessories (1c-ip), но в TS, т.к. сама RPC жёстко заточена под accessories:
 *   matched (price>0) → qty/price;
 *   нет в текущем снимке (по code_1c) → qty=0.
 * is_active НЕ трогаем (готовность карточки к показу — ручной контроль владельца,
 * см. комментарий в import-xls/apply/route.ts).
 */
async function applyCutPotSnapshot(
  supabase: ReturnType<typeof createAdminClient>,
  importId: number
): Promise<Record<string, unknown>> {
  type Row = { id: number; matched_product_id: number | null; qty: number | string | null; price: number | string | null }
  const rows: Row[] = []
  for (let from = 0; ; from += 1000) {
    const { data: page, error } = await supabase
      .from('stock_import_rows')
      .select('id, matched_product_id, qty, price')
      .eq('import_id', importId)
      .eq('status', 'matched')
      .order('id')
      .range(from, from + 999)
    if (error) throw error
    if (!page || page.length === 0) break
    rows.push(...(page as Row[]))
    if (page.length < 1000) break
  }

  const updates: Array<{ id: number; qty: number; price: number; rowId: number }> = []
  for (const r of rows) {
    if (!r.matched_product_id) continue
    const qty = Math.round(Number(r.qty))
    const price = Number(r.price)
    if (!Number.isFinite(qty) || !Number.isFinite(price) || price <= 0) continue
    updates.push({ id: r.matched_product_id, qty, price, rowId: r.id })
  }

  const updateResults = await Promise.allSettled(
    updates.map(u => supabase.from('products').update({ qty: u.qty, price: u.price }).eq('id', u.id))
  )
  let updated = 0
  let updateFailures = 0
  const appliedRowIds: number[] = []
  const ledgerRows: Array<Record<string, unknown>> = []
  updateResults.forEach((r, i) => {
    if (r.status === 'fulfilled' && !r.value.error) {
      updated++
      appliedRowIds.push(updates[i].rowId)
      ledgerRows.push({
        product_id: updates[i].id,
        action: 'import',
        quantity: updates[i].qty,
        qty_before: 0,
        qty_after: updates[i].qty,
        reference_type: 'import',
        created_by: null,
      })
    } else {
      updateFailures++
    }
  })

  for (let i = 0; i < ledgerRows.length; i += 500) {
    await supabase.from('inventory_ledger').insert(ledgerRows.slice(i, i + 500))
  }
  for (let i = 0; i < appliedRowIds.length; i += 500) {
    await supabase.from('stock_import_rows').update({ status: 'applied' }).in('id', appliedRowIds.slice(i, i + 500))
  }

  // Нет в текущем снимке (по code_1c, price>0) → qty=0. Только cut/pot с заполненным code_1c.
  const matchedIdsWithPrice = new Set(updates.map(u => u.id))
  const idsToZero: number[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('products')
      .select('id')
      .in('category', ['cut', 'pot'])
      .not('code_1c', 'is', null)
      .gt('qty', 0)
      .order('id')
      .range(from, from + 999)
    if (error) throw error
    if (!data || data.length === 0) break
    for (const p of data) if (!matchedIdsWithPrice.has(p.id)) idsToZero.push(p.id)
    if (data.length < 1000) break
  }
  let zeroed = 0
  for (let i = 0; i < idsToZero.length; i += 500) {
    const chunk = idsToZero.slice(i, i + 500)
    const { data, error } = await supabase.from('products').update({ qty: 0 }).in('id', chunk).select('id')
    if (error) throw error
    zeroed += data?.length ?? chunk.length
  }

  return { updated, update_failures: updateFailures, zeroed, applied_rows: appliedRowIds.length }
}

/** Симметрично zeroUnmatchedCodeLess1cAccessories, но для cut/pot: старые uralsk_1c
 *  карточки без code_1c (заведены до появления артикула), которых нет в текущем снимке. */
async function zeroUnmatchedCodeLessCutPot(
  supabase: ReturnType<typeof createAdminClient>,
  matchedProductIds: Set<number>
): Promise<number> {
  const idsToZero: number[] = []

  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('products')
      .select('id')
      .eq('source', 'uralsk_1c')
      .in('category', ['cut', 'pot'])
      .is('code_1c', null)
      .gt('qty', 0)
      .order('id')
      .range(from, from + 999)

    if (error) throw error
    if (!data || data.length === 0) break

    for (const product of data) {
      if (!matchedProductIds.has(product.id)) idsToZero.push(product.id)
    }

    if (data.length < 1000) break
  }

  let zeroed = 0
  for (const ids of chunks(idsToZero, 500)) {
    const { data, error } = await supabase
      .from('products')
      .update({ qty: 0 })
      .in('id', ids)
      .select('id')

    if (error) throw error
    zeroed += data?.length ?? ids.length
  }

  return zeroed
}

async function zeroUnmatchedCodeLess1cAccessories(
  supabase: ReturnType<typeof createAdminClient>,
  matchedProductIds: Set<number>
): Promise<number> {
  const idsToZero: number[] = []

  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('products')
      .select('id')
      .eq('source', 'uralsk_1c')
      .eq('category', 'accessories')
      .is('code_1c', null)
      .gt('qty', 0)
      .order('id')
      .range(from, from + 999)

    if (error) throw error
    if (!data || data.length === 0) break

    for (const product of data) {
      if (!matchedProductIds.has(product.id)) idsToZero.push(product.id)
    }

    if (data.length < 1000) break
  }

  let zeroed = 0
  for (const ids of chunks(idsToZero, 500)) {
    const { data, error } = await supabase
      .from('products')
      .update({ qty: 0 })
      .in('id', ids)
      .select('id')

    if (error) throw error
    zeroed += data?.length ?? ids.length
  }

  return zeroed
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
  const matchedProductIds = new Set<number>()
  for (const r of rows) {
    const code = r.code_1c as string
    const n = r.norm_name as string
    if (code && productByCode.has(code)) {
      const productId = productByCode.get(code)!
      r.matched_product_id = productId
      r.status = 'matched'
      r.match_source = 'code_1c'
      matchedProductIds.add(productId)
      matched++
    } else if (aliasByNorm.has(n)) {
      const productId = aliasByNorm.get(n)!
      r.matched_product_id = productId
      r.status = 'matched'
      r.match_source = 'alias'
      matchedProductIds.add(productId)
      matched++
    } else if (productByNorm.has(n)) {
      const productId = productByNorm.get(n)!
      r.matched_product_id = productId
      r.status = 'matched'
      r.match_source = 'exact_name'
      matchedProductIds.add(productId)
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

  // 6) Авто-применение к витрине для ОБОИХ источников. Синхронно, без ручного подтверждения.
  //    Зеркало склада: matched(price>0)→qty/price; нет в снимке (по code_1c)→qty=0; price<=0→qty=0.
  //    Old uralsk_1c products without code_1c are also zeroed when they are not matched by this snapshot.
  //    Не трогает is_active. Ошибка авто-применения НЕ валит приём снимка (он уже сохранён).
  let autoApply: Record<string, unknown> | null = null
  if (source === '1c-ip') {
    const { data: applyRes, error: applyErr } = await supabase.rpc('apply_1c_snapshot', { p_import_id: importId })
    if (applyErr) {
      console.error(`[1c/stock] auto-apply error import_id=${importId}:`, applyErr.message)
      autoApply = { error: applyErr.message }
    } else {
      autoApply = applyRes as Record<string, unknown>
      try {
        const orphanCodeNullZeroed = await zeroUnmatchedCodeLess1cAccessories(supabase, matchedProductIds)
        autoApply = { ...autoApply, orphan_code_null_zeroed: orphanCodeNullZeroed }
      } catch (orphanErr) {
        const message = orphanErr instanceof Error ? orphanErr.message : String(orphanErr)
        console.error(`[1c/stock] code-less orphan zero error import_id=${importId}:`, message)
        autoApply = { ...autoApply, orphan_code_null_zero_error: message }
      }
      console.log(`[1c/stock] auto-apply import_id=${importId}:`, JSON.stringify(autoApply))
    }
  } else if (source === '1c-too') {
    try {
      autoApply = await applyCutPotSnapshot(supabase, importId)
      try {
        const orphanCodeNullZeroed = await zeroUnmatchedCodeLessCutPot(supabase, matchedProductIds)
        autoApply = { ...autoApply, orphan_code_null_zeroed: orphanCodeNullZeroed }
      } catch (orphanErr) {
        const message = orphanErr instanceof Error ? orphanErr.message : String(orphanErr)
        console.error(`[1c/stock] cut/pot code-less orphan zero error import_id=${importId}:`, message)
        autoApply = { ...autoApply, orphan_code_null_zero_error: message }
      }
      console.log(`[1c/stock] auto-apply (cut/pot) import_id=${importId}:`, JSON.stringify(autoApply))
    } catch (applyErr) {
      const message = applyErr instanceof Error ? applyErr.message : String(applyErr)
      console.error(`[1c/stock] cut/pot auto-apply error import_id=${importId}:`, message)
      autoApply = { error: message }
    }
  }

  // 7) Чистка staging: удаляем superseded строки (старые снимки не храним — новый затирает
  //    старый каждые 30 мин). Только superseded; актуальный снимок (matched/unmatched/applied)
  //    не трогаем. Ошибка чистки НЕ валит приём снимка.
  let cleaned: number | null = null
  {
    const { data: delCount, error: cleanErr } = await supabase.rpc('cleanup_superseded_snapshots')
    if (cleanErr) console.error(`[1c/stock] cleanup warn:`, cleanErr.message)
    else { cleaned = delCount as number; if (cleaned) console.log(`[1c/stock] cleanup removed ${cleaned} superseded rows`) }
  }

  console.log(
    `[1c/stock] source=${source} warehouse=${warehouse ?? '-'} price_type=${price_type ?? '-'} ` +
    `category=${category ?? '-'} received=${items.length} written=${written} matched=${matched} ` +
    `unmatched=${written - matched} skipped=${skipped} import_id=${importId}`
  )

  return NextResponse.json({
    ok: true, import_id: importId,
    received: items.length, written,
    matched, unmatched: written - matched,
    auto_apply: autoApply,
    cleaned_superseded: cleaned,
  })
}

// только POST
export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
}

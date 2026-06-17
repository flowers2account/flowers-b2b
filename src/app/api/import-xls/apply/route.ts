export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthedWithRole } from '@/lib/api-auth'

export async function POST(req: NextRequest) {
  const authed = await getAuthedWithRole(req, ['admin', 'manager'])
  if (!authed) return NextResponse.json({ error: 'Доступ запрещён' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { importId, userId } = body

  if (!importId) return NextResponse.json({ error: 'importId required' }, { status: 400 })

  const supabase = await createClient()

  // ⚠️ PostgREST max_rows=1000 — без пагинации select молча вернул бы первые 1000
  // matched-строк. Полный снимок 1С может дать >1000 matched → пагинируем .range().
  type ImportRow = {
    id: number; raw_name: string | null; matched_product_id: number | null
    qty: number | string | null; price: number | string | null; source: string | null
    enriched_country_iso: string | null; enriched_display_name: string | null
    enriched_colors: string[] | null
  }
  const rows: ImportRow[] = []
  for (let from = 0; ; from += 1000) {
    const { data: page, error: rowsErr } = await supabase
      .from('stock_import_rows')
      .select('id, raw_name, matched_product_id, qty, price, source, enriched_country_iso, enriched_display_name, enriched_colors')
      .eq('import_id', importId)
      .eq('status', 'matched')
      .order('id', { ascending: true })
      .range(from, from + 999)
    if (rowsErr) return NextResponse.json({ error: rowsErr.message }, { status: 500 })
    if (!page || page.length === 0) break
    rows.push(...(page as ImportRow[]))
    if (page.length < 1000) break
  }

  if (!rows.length) return NextResponse.json({ applied: 0, importedIds: [], categories: [] })

  const productIds = [...new Set(rows.map(r => r.matched_product_id).filter(Boolean))] as number[]

  // products через .in(...) тоже капается на 1000 — тянем чанками по 500 id.
  type ProductRow = {
    id: number; category: string; price: number | string | null
    country_iso: string | null; display_name: string | null; colors: string[] | null
  }
  const products: ProductRow[] = []
  for (let i = 0; i < productIds.length; i += 500) {
    const { data, error: prodErr } = await supabase
      .from('products')
      .select('id, category, price, country_iso, display_name, colors')
      .in('id', productIds.slice(i, i + 500))
    if (prodErr) return NextResponse.json({ error: prodErr.message }, { status: 500 })
    if (data) products.push(...(data as ProductRow[]))
  }

  const productMap = new Map((products ?? []).map(p => [p.id, p]))
  const categoriesSet = new Set<string>()
  const importedIds: number[] = []
  const errorLog: string[] = []

  // Build update payloads
  const updates: Array<{ id: number; payload: Record<string, unknown> }> = []
  const ledgerRows: Array<Record<string, unknown>> = []
  const appliedRowIds: number[] = []

  for (const row of rows) {
    if (row.matched_product_id == null) continue
    const product = productMap.get(row.matched_product_id)
    if (!product) continue

    // ⚠️ Приведение типов. qty/price в stock_import_rows — numeric, но PostgREST
    // сериализует numeric как СТРОКУ ("46"/"545"), и products.qty (integer) /
    // products.price (numeric) могли бы получить строку через неявное приведение.
    // Приводим явно: qty → целое, price → число. Битые значения пропускаем,
    // чтобы на витрину не попал текст/мусор вместо числа.
    // ОТБОЙ на пусто/null/undefined ДО Number(): Number("")===0 и Number(null)===0 —
    // иначе пустое qty деактивировало бы товар (0), пустое price поставило бы 0 ₸.
    const isBlank = (v: unknown) => v == null || (typeof v === 'string' && v.trim() === '')
    if (isBlank(row.qty) || isBlank(row.price)) {
      errorLog.push(`${row.matched_product_id ?? row.id}: пустые qty/price (qty="${row.qty}", price="${row.price}")`)
      continue
    }
    const qtyNum = Math.round(Number(row.qty))
    const priceNum = Number(row.price)
    if (!Number.isFinite(qtyNum) || !Number.isFinite(priceNum)) {
      errorLog.push(`${row.matched_product_id ?? row.id}: нечисловые qty/price (qty="${row.qty}", price="${row.price}")`)
      continue
    }
    const curPrice = product.price != null ? Number(product.price) : null

    categoriesSet.add(product.category)

    // ⚠️ Аллоулист обновляемых полей. НАМЕРЕННО не трогаем ручные поля:
    // pack_size (кратность), unit, length_cm, image_url, tags и т.п. — импорт
    // обновляет только остаток/цену/активность (+ обогащает пустые поля ниже).
    // Кратность рулонных расходников (спанбонд 150 пог. м и др.) задаётся вручную
    // и НЕ должна сбрасываться при повторной загрузке прайса.
    const payload: Record<string, unknown> = {
      qty: qtyNum,
      price: priceNum,
      is_active: true,
    }

    if (curPrice != null && Number.isFinite(curPrice) && priceNum < curPrice) {
      payload.previous_price = curPrice
    }
    if (!product.country_iso && row.enriched_country_iso) {
      payload.country_iso = row.enriched_country_iso
    }
    if (!product.display_name && row.enriched_display_name) {
      payload.display_name = row.enriched_display_name
    }
    if (!(product.colors as string[] | null)?.length && row.enriched_colors?.length) {
      payload.colors = row.enriched_colors
    }

    updates.push({ id: product.id, payload })
    ledgerRows.push({
      product_id: product.id,
      action: 'import',
      quantity: qtyNum,
      qty_before: 0,
      qty_after: qtyNum,
      reference_type: 'import',
      created_by: userId ?? null,
    })
    appliedRowIds.push(row.id)
    importedIds.push(product.id)
  }

  // Parallel product updates
  const updateResults = await Promise.allSettled(
    updates.map(({ id, payload }) =>
      supabase.from('products').update(payload).eq('id', id)
    )
  )

  let updateFailures = 0
  updateResults.forEach((r, i) => {
    if (r.status === 'rejected') {
      errorLog.push(`${updates[i].id}: ${String(r.reason)}`)
      updateFailures++
    } else if (r.value.error) {
      errorLog.push(`${updates[i].id}: ${r.value.error.message}`)
      updateFailures++
    }
  })

  // Batch insert ledger (чанками — большой снимок может дать >1000 строк)
  for (let i = 0; i < ledgerRows.length; i += 500) {
    await supabase.from('inventory_ledger').insert(ledgerRows.slice(i, i + 500))
  }

  // Mark rows as applied (чанками — .in(...) с >1000 id раздувает запрос)
  for (let i = 0; i < appliedRowIds.length; i += 500) {
    await supabase.from('stock_import_rows')
      .update({ status: 'applied' })
      .in('id', appliedRowIds.slice(i, i + 500))
  }

  const applied = importedIds.length - updateFailures

  // 1С-импорт (строки с source) — это снимок одного источника, НЕ полный срез категории.
  // categories: [] блокирует finalize на клиенте → деактивация отсутствующих не выполняется,
  // apply обновляет ТОЛЬКО сматченные позиции.
  const is1cImport = rows.some(r => (r as { source?: string | null }).source != null)

  return NextResponse.json({
    applied,
    importedIds,
    categories: is1cImport ? [] : Array.from(categoriesSet),
    errors: errorLog.length,
    errorLog,
  })
}

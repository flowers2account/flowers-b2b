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

  const { data: rows, error: rowsErr } = await supabase
    .from('stock_import_rows')
    .select('id, raw_name, matched_product_id, qty, price, source, enriched_country_iso, enriched_display_name, enriched_colors')
    .eq('import_id', importId)
    .eq('status', 'matched')

  if (rowsErr) return NextResponse.json({ error: rowsErr.message }, { status: 500 })
  if (!rows?.length) return NextResponse.json({ applied: 0, importedIds: [], categories: [] })

  const productIds = [...new Set(rows.map(r => r.matched_product_id).filter(Boolean))] as number[]

  const { data: products, error: prodErr } = await supabase
    .from('products')
    .select('id, category, price, country_iso, display_name, colors')
    .in('id', productIds)

  if (prodErr) return NextResponse.json({ error: prodErr.message }, { status: 500 })

  const productMap = new Map((products ?? []).map(p => [p.id, p]))
  const categoriesSet = new Set<string>()
  const importedIds: number[] = []
  const errorLog: string[] = []

  // Build update payloads
  const updates: Array<{ id: number; payload: Record<string, unknown> }> = []
  const ledgerRows: Array<Record<string, unknown>> = []
  const appliedRowIds: number[] = []

  for (const row of rows) {
    const product = productMap.get(row.matched_product_id)
    if (!product) continue

    categoriesSet.add(product.category)

    // ⚠️ Аллоулист обновляемых полей. НАМЕРЕННО не трогаем ручные поля:
    // pack_size (кратность), unit, length_cm, image_url, tags и т.п. — импорт
    // обновляет только остаток/цену/активность (+ обогащает пустые поля ниже).
    // Кратность рулонных расходников (спанбонд 150 пог. м и др.) задаётся вручную
    // и НЕ должна сбрасываться при повторной загрузке прайса.
    const payload: Record<string, unknown> = {
      qty: row.qty,
      price: row.price,
      is_active: true,
    }

    if (product.price && row.price < product.price) {
      payload.previous_price = product.price
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
      quantity: row.qty,
      qty_before: 0,
      qty_after: row.qty,
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

  updateResults.forEach((r, i) => {
    if (r.status === 'rejected') {
      errorLog.push(`${updates[i].id}: ${String(r.reason)}`)
    } else if (r.value.error) {
      errorLog.push(`${updates[i].id}: ${r.value.error.message}`)
    }
  })

  // Batch insert ledger
  if (ledgerRows.length > 0) {
    await supabase.from('inventory_ledger').insert(ledgerRows)
  }

  // Batch mark rows as applied
  if (appliedRowIds.length > 0) {
    await supabase.from('stock_import_rows')
      .update({ status: 'applied' })
      .in('id', appliedRowIds)
  }

  const applied = importedIds.length - errorLog.length

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

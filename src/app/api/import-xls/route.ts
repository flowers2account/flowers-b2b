import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import * as XLSX from 'xlsx'
import { parseNomenclature } from '@/lib/parse-nomenclature'

export async function POST(req: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (!['admin', 'manager'].includes(profile?.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const formData = await req.formData()
  const file = formData.get('file') as File
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][]

  // Парсим строки: пропускаем заголовок и пустые
  const rows: { name: string; qty: number; price: number }[] = []
  for (const row of rawRows) {
    if (!Array.isArray(row)) continue
    const name = String(row[0] ?? '').trim()
    const qty = Number(row[1])
    const price = Number(row[2])
    if (!name || name.toLowerCase().includes('наименов')) continue
    if (isNaN(qty) || qty <= 0 || isNaN(price) || price <= 0) continue
    rows.push({ name, qty: Math.round(qty), price })
  }

  if (rows.length === 0)
    return NextResponse.json({ error: 'Нет данных в файле' }, { status: 400 })

  let success = 0
  let errors = 0
  const errorLog: string[] = []
  const today = new Date().toISOString().split('T')[0]

  for (const row of rows) {
    try {
      const parsed = parseNomenclature(row.name)

      // 1. Создаём или находим сорт (variety)
      const { data: variety, error: vErr } = await supabase
        .from('varieties')
        .upsert({ name: parsed.variety_name, category: parsed.category }, { onConflict: 'name' })
        .select('id').single()
      if (vErr || !variety) throw new Error('Ошибка variety: ' + vErr?.message)

      // 2. Создаём или находим товар (product)
      const { data: product, error: pErr } = await supabase
        .from('products')
        .upsert({
          variety_id: variety.id,
          variety_name: parsed.variety_name,
          length_str: parsed.length_str,
          length_cm: parsed.length_cm,
          pack_size: parsed.pack_size,
          category: parsed.category,
          name: row.name,
          is_active: true,
        }, { onConflict: 'variety_id,length_str' })
        .select('id').single()
      if (pErr || !product) throw new Error('Ошибка product: ' + pErr?.message)

      // 3. Партия (batch) — если цена совпадает, суммируем; иначе новая партия
      const { data: existingBatch } = await supabase
        .from('batches')
        .select('id, stock')
        .eq('product_id', product.id)
        .eq('price', row.price)
        .eq('is_active', true)
        .order('arrival_date', { ascending: true })
        .limit(1)
        .maybeSingle()

      if (existingBatch) {
        await supabase.from('batches')
          .update({ stock: existingBatch.stock + row.qty })
          .eq('id', existingBatch.id)
      } else {
        await supabase.from('batches').insert({
          product_id: product.id,
          price: row.price,
          stock: row.qty,
          stock_reserved: 0,
          arrival_date: today,
          is_active: true,
        })
      }

      // 4. Обновляем агрегированный stock
      const { data: allBatches } = await supabase
        .from('batches')
        .select('price, stock, stock_reserved')
        .eq('product_id', product.id)
        .eq('is_active', true)

      const totalQty = (allBatches ?? []).reduce((s, b) => s + b.stock, 0)
      const totalReserved = (allBatches ?? []).reduce((s, b) => s + b.stock_reserved, 0)
      const minPrice = Math.min(...(allBatches ?? []).map(b => b.price))

      await supabase.from('stock').upsert({
        product_id: product.id,
        qty: totalQty,
        qty_reserved: totalReserved,
        price: minPrice,
        is_available: totalQty > totalReserved,
      }, { onConflict: 'product_id' })

      // 5. Запись в ledger
      await supabase.from('inventory_ledger').insert({
        product_id: product.id,
        action: 'import',
        quantity: row.qty,
        reference_type: 'import',
        created_by: user.id,
      })

      success++
    } catch (e) {
      errors++
      errorLog.push(`${row.name}: ${String(e)}`)
    }
  }

  return NextResponse.json({ success, errors, errorLog })
}
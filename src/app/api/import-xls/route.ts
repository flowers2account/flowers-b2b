export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import * as XLSX from 'xlsx'
import { parseNomenclature } from '@/lib/parse-nomenclature'

export async function POST(req: NextRequest) {
  const supabase = await createClient()

  const formData = await req.formData()
  const file = formData.get('file') as File
  const userId = formData.get('userId') as string
  const isLast = formData.get('isLast') === 'true'
  const isFirst = formData.get('isFirst') === 'true'
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][]

  // Парсим строки из формата 1С
  // Формат: [пусто, Наименование, Количество, Цена, Стоимость]
  // или старый формат: [Наименование, Количество, Цена]
  const rows: { name: string; qty: number; price: number }[] = []

  for (const row of rawRows) {
    if (!Array.isArray(row)) continue

    // Определяем формат: если col[0] пустой и col[1] - строка - это формат 1С
    const col0 = String(row[0] ?? '').trim()
    const col1 = String(row[1] ?? '').trim()
    const col2 = String(row[2] ?? '').trim()
    const col3 = String(row[3] ?? '').trim()

    let name = '', qtyRaw = '', priceRaw = ''

    if (!col0 && col1 && col1.length > 2) {
      // Формат 1С: пустая первая колонка
      name = col1
      qtyRaw = col2
      priceRaw = col3
    } else if (col0 && col0.length > 2) {
      // Старый формат: наименование в первой колонке
      name = col0
      qtyRaw = col1
      priceRaw = col2
    } else {
      continue
    }

    // Пропускаем заголовки и итоги
    const nameLower = name.toLowerCase()
    if (nameLower.includes('наименов') || nameLower.includes('номенклат') ||
        nameLower.includes('итог') || nameLower.includes('склад') ||
        nameLower.includes('период') || nameLower.includes('показател') ||
        nameLower.includes('группировк') || nameLower.includes('отбор') ||
        nameLower === 'основная' || nameLower === 'основной склад' || nameLower === 'основной') continue

    // Парсим числа (формат 1С: "1 234,56" или "1234.56")
    const parseNum = (s: string) => {
      const cleaned = String(s).replace(/\s/g, '').replace(',', '.')
      return parseFloat(cleaned)
    }

    const qty = parseNum(qtyRaw)
    const price = parseNum(priceRaw)

    if (!name || isNaN(qty) || qty <= 0 || isNaN(price) || price <= 0) continue
    rows.push({ name: name.trim(), qty: Math.round(qty), price })
  }

  if (rows.length === 0)
    return NextResponse.json({ error: 'Нет данных в файле' }, { status: 400 })

  let success = 0
  let errors = 0
  let zeroed = 0
  const errorLog: string[] = []
  const today = new Date().toISOString().split('T')[0]
  const importedProductIds = new Set<number>()

  // Определяем категорию и источник по имени файла
  const fileNameLower = file.name.toLowerCase()
  const categoryOverride: 'cut' | 'pot' | null =
    fileNameLower.includes('горшок') || fileNameLower.includes('горш') ? 'pot' :
    fileNameLower.includes('срез') ? 'cut' : null
  const isChina = fileNameLower.includes('китай') || fileNameLower.includes('china')

  if (isFirst && categoryOverride) {
    const { data: allProducts } = await supabase
      .from('products').select('id')
      .eq('category', categoryOverride).eq('is_active', true)
    if (allProducts?.length) {
      const ids = allProducts.map(p => p.id)
      // Деактивируем старые партии, но stock НЕ обнуляем — будем суммировать
      await supabase.from('batches').update({ is_active: false }).in('product_id', ids)
    }
  }

  const processedProductIds = new Set<number>()
  // Отслеживаем цену первого вхождения каждой комбинации variety_name+length_str в этом файле.
  // Если то же сочетание встречается снова с другой ценой → создаём отдельный товар.
  const processedVLPrice = new Map<string, number>() // "varietyName:lengthStr" → price

  for (const row of rows) {
    try {
      const _parsed = parseNomenclature(row.name)
      const originValue: string | null = isChina ? 'china' : (_parsed as any).origin ?? null
      // Ключ включает origin — China и non-China одного товара не конфликтуют
      const vlKey = `${_parsed.variety_name}:${_parsed.length_str ?? ''}:${originValue ?? ''}`
      const seenPrice = processedVLPrice.get(vlKey)
      // Одинаковые variety+length+origin но разная цена → суффикс цены (редкий случай)
      const effectiveVarietyName = (seenPrice !== undefined && Math.abs(seenPrice - row.price) > 1)
        ? `${_parsed.variety_name} [${Math.round(row.price)}₸]`
        : _parsed.variety_name

      const parsed = {
        ..._parsed,
        category: categoryOverride ?? _parsed.category,
        variety_name: effectiveVarietyName,
        origin: originValue,
      }

      // 1. Создаём или находим сорт (variety)
      const { data: variety, error: vErr } = await supabase
        .from('varieties')
        .upsert({ name: parsed.variety_name, category: categoryOverride ?? parsed.category }, { onConflict: 'name', ignoreDuplicates: false })
        .select('id').single()
      if (vErr || !variety) throw new Error(`variety: ${vErr?.code} ${vErr?.message}`)

      // 2. Создаём или находим товар (product)
      const productQuery = supabase
        .from('products')
        .select('id, pack_size')
        .eq('variety_id', variety.id)

      const { data: existingProduct } = await (
        parsed.length_str
          ? productQuery.eq('length_str', parsed.length_str)
          : productQuery.is('length_str', null)
      ).maybeSingle()

      let product
      if (existingProduct) {
        // получаем текущую цену из stock для сравнения
        const { data: currentStock } = await supabase
          .from('stock')
          .select('price')
          .eq('product_id', existingProduct.id)
          .maybeSingle()

        const currentPrice = currentStock?.price ?? null
        const isPriceDown = currentPrice && row.price < currentPrice

        const { data: updatedProduct, error: pErr } = await supabase
          .from('products')
          .update({
            variety_name: parsed.variety_name,
            length_cm: parsed.length_cm,
            category: categoryOverride ?? parsed.category,
            name: row.name,
            is_active: true,
            previous_price: isPriceDown ? currentPrice : null,
            ...(parsed.origin ? { origin: parsed.origin } : {}),
          })
          .eq('id', existingProduct.id)
          .select('id').single()
        if (pErr || !updatedProduct) throw new Error(`product update: ${pErr?.code} ${pErr?.message}`)
        product = updatedProduct
      } else {
        const { data: newProduct, error: pErr } = await supabase
          .from('products')
          .insert({
            variety_id: variety.id,
            variety_name: parsed.variety_name,
            length_str: parsed.length_str,
            length_cm: parsed.length_cm,
            pack_size: 5,
            category: categoryOverride ?? parsed.category,
            name: row.name,
            is_active: true,
            origin: parsed.origin ?? null,
          })
          .select('id').single()
        if (pErr || !newProduct) throw new Error(`product insert: ${pErr?.code} ${pErr?.message}`)
        product = newProduct
      }

      // 3. Партия (найти по цене → UPDATE stock) или создать новую через sync_stock_from_1c.
      // Поиск по (product_id, price) БЕЗ arrival_date — дата прихода не перезаписывается.
      // Если isFirst деактивировал все партии выше — функция создаст новую с arrival_date=today.
      const { error: syncErr } = await supabase.rpc('sync_stock_from_1c', {
        p_name: row.name,
        p_new_qty: row.qty,
        p_new_price: row.price,
        p_arrival_date: today,
      })
      if (syncErr) throw new Error(`sync_stock: ${syncErr.message}`)

      // 4. Запись в ledger
      await supabase.from('inventory_ledger').insert({
        product_id: product.id,
        action: 'import',
        quantity: row.qty,
        qty_before: 0,
        qty_after: row.qty,
        reference_type: 'import',
        created_by: userId || null,
      })

      importedProductIds.add(product.id)
      processedProductIds.add(product.id)
      if (!processedVLPrice.has(vlKey)) processedVLPrice.set(vlKey, row.price)
      success++
    } catch (e) {
      errors++
      errorLog.push(`${row.name}: ${String(e)}`)
    }
  }

  // Синхронизируем stock с batches на случай пропущенных ошибок
  const { error: syncError } = await supabase.rpc('sync_stock_from_batches')
  if (syncError) console.error('Stock sync error:', syncError)

  // Деактивируем товары только при одиночной загрузке (isFirst=true И isLast=true).
  // При множественных файлах importedProductIds содержит только последний файл,
  // что ошибочно деактивирует товары из предыдущих файлов.
  if (isFirst && isLast && categoryOverride && importedProductIds.size > 0) {
    const { data: allInCategory } = await supabase
      .from('products')
      .select('id')
      .eq('category', categoryOverride)
      .eq('is_active', true)

    if (allInCategory?.length) {
      const toDeactivate = allInCategory
        .map((p: { id: number }) => p.id)
        .filter((id: number) => !importedProductIds.has(id))

      if (toDeactivate.length > 0) {
        await supabase
          .from('products')
          .update({ is_active: false })
          .in('id', toDeactivate)
        zeroed = toDeactivate.length
      }
    }
  }

  return NextResponse.json({ success, errors, zeroed, errorLog })
}
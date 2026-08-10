export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseNomenclature } from '@/lib/parse-nomenclature'
import { getAuthedWithRole } from '@/lib/api-auth'

const CATEGORIES = new Set(['cut', 'pot', 'accessories'])

// Витрина показывает только эти source (см. catalog/page.tsx, api/products, api/facets).
// Прежнее значение '1c_manual' в этот список не входит — карточки, созданные из строки
// импорта, физически существовали, но на сайт не попадали никогда.
const PUBLISH_SOURCE = 'uralsk_1c'

/** Категория по контуру выгрузки, когда 1С не прислала file_category (она всегда NULL). */
function guessCategory(source: string | null, fileCategory: string | null): string {
  if (fileCategory && CATEGORIES.has(fileCategory)) return fileCategory
  if (source === '1c-ip') return 'accessories'   // контур ИП — расходка
  if (source === '1c-too') return 'pot'          // контур ТОО — цветы/горшечные
  return 'cut'
}

export async function POST(req: NextRequest) {
  const authed = await getAuthedWithRole(req, ['admin', 'manager'])
  if (!authed) return NextResponse.json({ error: 'Доступ запрещён' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { rowId, fields } = body as { rowId?: number; fields?: Record<string, unknown> }

  if (!rowId) return NextResponse.json({ error: 'rowId required' }, { status: 400 })

  const supabase = createAdminClient()

  const { data: row, error: rowErr } = await supabase
    .from('stock_import_rows')
    .select('*')
    .eq('id', rowId)
    .single()

  if (rowErr || !row) return NextResponse.json({ error: 'Row not found' }, { status: 404 })
  if (row.status === 'applied') return NextResponse.json({ error: 'Строка уже применена' }, { status: 400 })

  // Повторное нажатие «Создать карточку» раньше плодило дубли: три «Фацелии»
  // и два «антуриума джамбо ред» с одним и тем же артикулом. Ключ 1С уникален —
  // проверяем до вставки и возвращаем существующую карточку вместо второй.
  if (row.code_1c) {
    const { data: dup } = await supabase
      .from('products')
      .select('id, display_name, name, category, is_active')
      .eq('code_1c', row.code_1c)
      .limit(1)
      .maybeSingle()
    if (dup) {
      return NextResponse.json({
        error: `Карточка с артикулом ${row.code_1c} уже есть: #${dup.id} «${dup.display_name || dup.name}»` +
               ` (${dup.category}${dup.is_active ? '' : ', неактивна'}). Привяжите строку к ней, а не создавайте новую.`,
        existing: dup,
      }, { status: 409 })
    }
  }

  const f = fields ?? {}
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  const num = (v: unknown) => {
    if (v == null || v === '') return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }

  const category = CATEGORIES.has(String(f.category))
    ? String(f.category)
    : guessCategory(row.source, row.file_category)

  const parsed = parseNomenclature(row.raw_name)

  // qty/price из stock_import_rows приходят строками (numeric в PostgREST) — приводим явно,
  // иначе в integer-колонку qty уедет строка, а на витрину — текст вместо числа
  const qty = Math.round(num(f.qty) ?? num(row.qty) ?? 0)
  const price = num(f.price) ?? num(row.price) ?? 0
  // pack_size в БД имеет default=5 — для товара, заводимого поштучно, это ловушка
  const packSize = Math.max(1, Math.round(num(f.pack_size) ?? 1))

  const newProduct: Record<string, unknown> = {
    name: str(f.name) ?? row.raw_name,
    category,
    source: PUBLISH_SOURCE,
    qty,
    price,
    pack_size: packSize,
    is_active: f.is_active === undefined ? true : Boolean(f.is_active),
    arrival_date: new Date().toISOString().slice(0, 10),
  }

  // артикул 1С — главный ключ автоматча следующей выгрузки; без него карточка
  // каждый раз приходила бы как unmatched
  if (row.code_1c) newProduct.code_1c = row.code_1c

  // Имя из 1С приходит как «антуриум джамбо ред 35  9» — со строчной буквы и
  // двойными пробелами. Пустой display_name означал, что эта строка уезжает на
  // витрину как есть; чистим и капитализируем.
  const tidy = (s: string) => {
    const t = s.replace(/\s+/g, ' ').trim()
    return t ? t[0].toUpperCase() + t.slice(1) : t
  }
  const rawDisplay = str(f.display_name) ?? row.enriched_display_name ?? row.raw_name
  const displayName = rawDisplay ? tidy(rawDisplay) : null
  if (displayName) newProduct.display_name = displayName

  const subcategory = str(f.subcategory) ?? row.enriched_subcategory
  if (subcategory) newProduct.subcategory = subcategory

  if (category === 'accessories') {
    const unit = str(f.unit)
    if (unit) newProduct.unit = unit
  } else {
    // характеристики среза/горшка — только для своей категории
    const colors = Array.isArray(f.colors) ? (f.colors as string[]).filter(Boolean) : row.enriched_colors
    if (colors?.length) newProduct.colors = colors

    const country = str(f.country_iso) ?? row.enriched_country_iso ?? row.file_country
    if (country) newProduct.country_iso = country

    if (category === 'cut') {
      const len = num(f.length_cm) ?? parsed.length_cm
      if (len != null) newProduct.length_cm = len
      const vt = str(f.variety_type) ?? row.enriched_variety_type
      if (vt) newProduct.variety_type = vt
    }
    if (category === 'pot') {
      const d = num(f.pot_diameter)
      if (d != null) newProduct.pot_diameter = d
      // stems_per_pack к горшечным неприменимо — не заполняем принципиально
    }
  }

  const { data: created, error: insErr } = await supabase
    .from('products')
    .insert(newProduct)
    .select('id, is_active, category, subcategory, name, display_name, code_1c, supplier_ref, source, length_cm, image_url, colors')
    .single()

  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  // Alias — чтобы следующая выгрузка нашла карточку по имени, если артикул не совпадёт.
  // Не перетираем уже существующий алиас: он мог быть заведён осознанно на другую карточку.
  const normName = (row.norm_name ?? row.raw_name.toLowerCase().trim().replace(/\s+/g, ' '))
  const { data: existingAlias } = await supabase
    .from('stock_aliases').select('product_id').eq('norm_name', normName).maybeSingle()
  if (!existingAlias) {
    await supabase.from('stock_aliases')
      .insert({ norm_name: normName, raw_name: row.raw_name, product_id: created.id })
  }

  await supabase.from('stock_import_rows').update({
    matched_product_id: created.id,
    status: 'matched',
    match_source: '1c_manual',
  }).eq('id', rowId)

  return NextResponse.json({ product: created, aliasKept: !!existingAlias })
}

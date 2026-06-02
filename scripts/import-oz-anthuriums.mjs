// import-oz-anthuriums.mjs
// Импорт антуриумов OZ из JSONL + display_name.
// Запуск: node --env-file=.env.local scripts/import-oz-anthuriums.mjs [path/to/file.jsonl]

import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

const JSONL_PATH = process.argv[2] || 'C:\\Users\\Владелец\\Desktop\\oz-parser-new\\output\\Anthuriums.jsonl'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

// ── Перевод display_name ──────────────────────────────────────────────────────

const DISPLAY_NAMES = {
  // из TM
  'anthurium marysia':        'Антуриум «Маруся»',
  'anthurium zafira':         'Антуриум «Зафира»',
  // генерированные
  'anthurium kaseko':         'Антуриум «Касеко»',
  'anthurium rambla':         'Антуриум «Рамбла»',
  'anthurium tequila':        'Антуриум «Текила»',
  'anthurium acropolis':      'Антуриум «Акрополис»',
  'anthurium acura':          'Антуриум «Акура»',
  'anthurium adina':          'Антуриум «Адина»',
  'anthurium alero':          'Антуриум «Алеро»',
  'anthurium amigo':          'Антуриум «Амиго»',
  'anthurium amigo improve':  'Антуриум «Амиго Импрув»',
  'anthurium avo gabriella':  'Антуриум «Аво Габриэлла»',
  'anthurium avo summer':     'Антуриум «Аво Саммер»',
  'anthurium caldonia':       'Антуриум «Калдония»',
  'anthurium calisto':        'Антуриум «Калисто»',
  'anthurium candy':          'Антуриум «Кэнди»',
  'anthurium cantello':       'Антуриум «Кантелло»',
  'anthurium caribean':       'Антуриум «Карибеан»',
  'anthurium caribo':         'Антуриум «Карибо»',
  'anthurium cerato':         'Антуриум «Церато»',
  'anthurium champagne':      'Антуриум «Шампань»',
  'anthurium cheers':         'Антуриум «Чирс»',
  'anthurium choco':          'Антуриум «Чоко»',
  'anthurium cognac':         'Антуриум «Коньяк»',
}

// ── Нормализация цветов ───────────────────────────────────────────────────────

const COLOR_NORM = {
  'white': 'white', 'cream': 'cream', 'ivory': 'cream',
  'yellow': 'yellow', 'orange': 'orange',
  'orange_yellow': 'yellow_orange', 'yellow_orange': 'yellow_orange',
  'apricot': 'peach', 'salmon': 'peach', 'peach': 'peach',
  'coral': 'coral', 'red': 'red', 'red_dark': 'burgundy', 'dark_red': 'burgundy', 'burgundy': 'burgundy',
  'pink': 'pink', 'light_pink': 'light_pink',
  'hot_pink': 'hot_pink', 'fuchsia': 'hot_pink', 'cerise': 'hot_pink',
  'purple': 'purple', 'lilac': 'lilac', 'lavender': 'lavender',
  'blue': 'blue', 'green': 'green',
  'bronze': 'terracotta', 'brown': 'brown', 'black': 'black',
  'silver': 'silver', 'grey': 'silver',
  'multicolor': 'multicolor', 'mixed': 'multicolor',
  'tricolour': 'multicolor', 'tricolor': 'multicolor',
  'bicolor': 'bicolor', 'bicolour': 'bicolor',
  'red_white': 'bicolor_red_white',
  'red_green': 'bicolor',
  'green_pink': 'bicolor',
}

function normalizeColors(arr) {
  if (!arr?.length) return null
  const mapped = arr.map(c => COLOR_NORM[c.toLowerCase()] ?? 'bicolor').filter(Boolean)
  return mapped.length ? mapped : null
}

function fixPhotoUrl(url) {
  if (!url) return null
  return url.replace(/image\/fetch\/[^/]+\//, 'image/fetch/f_auto,q_auto/')
}

// ── Чтение и дедупликация ─────────────────────────────────────────────────────

const raw = fs.readFileSync(JSONL_PATH, 'utf-8').replace(/^﻿/, '')
const allRows = raw.split('\n').filter(Boolean).map(l => JSON.parse(l))
  .filter(r => r.name)   // пропускаем записи без имени (неудачный парсинг)

const QUALITY_RANK = { 'AA': 2, 'A1': 1 }
const deduped = new Map()
for (const r of allRows) {
  const key = r.name.toLowerCase()
  const prev = deduped.get(key)
  if (!prev || (QUALITY_RANK[r.quality_grade] ?? 0) > (QUALITY_RANK[prev.quality_grade] ?? 0)) {
    deduped.set(key, r)
  }
}
const items = [...deduped.values()]
console.log(`\n[OZ Anthuriums] записей: ${allRows.length} → после дедупликации: ${items.length}`)

const missing = items.filter(r => !DISPLAY_NAMES[r.name.toLowerCase()])
if (missing.length) {
  console.warn(`⚠ Нет перевода для ${missing.length} позиций:`)
  missing.forEach(r => console.warn('  ', r.name))
}

// ── Импорт ────────────────────────────────────────────────────────────────────

let inserted = 0, updated = 0, errors = 0
const today = new Date().toISOString().split('T')[0]

for (const item of items) {
  const colors       = normalizeColors(item.colors)
  const display_name = DISPLAY_NAMES[item.name.toLowerCase()] ?? null
  // Битая кодировка фермы — пропускаем если не ASCII+кириллица
  const farm = item.farm && /^[\x20-\x7EÀ-ɏЀ-ӿ\s]+$/.test(item.farm)
    ? item.farm : null

  const product = {
    name:           item.name,
    category:       'cut',
    subcategory:    'anthuriums',
    length_cm:      item.length_cm ?? null,
    country_iso:    item.country_iso ?? 'NL',
    colors,
    image_url:      fixPhotoUrl(item.image_url),
    qty:            999,
    pack_size:      item.pack_size ?? 4,
    stems_per_pack: item.stems_per_pack ?? null,
    weight_gram:    item.weight_gram ?? null,
    quality_grade:  item.quality_grade ?? null,
    container_code: item.container_code ?? null,
    price:          999,
    is_active:      true,
    arrival_date:   today,
    farm,
    supplier_ref:   item.oz_product_code ?? null,
    source:         'oz_export',
    ...(display_name ? { display_name } : {}),
  }

  const { data: rows } = await supabase
    .from('products')
    .select('id, name, display_name, colors, image_url')
    .ilike('name', item.name)
    .limit(1)
  const existing = rows?.[0] ?? null

  if (existing) {
    const displayNameIsRaw = existing.display_name === existing.name
    const { error } = await supabase
      .from('products')
      .update({
        qty:            product.qty,
        is_active:      product.is_active,
        subcategory:    product.subcategory,
        country_iso:    product.country_iso,
        pack_size:      product.pack_size,
        stems_per_pack: product.stems_per_pack,
        ...(product.weight_gram    ? { weight_gram:    product.weight_gram }    : {}),
        ...(product.quality_grade  ? { quality_grade:  product.quality_grade }  : {}),
        ...(product.container_code ? { container_code: product.container_code } : {}),
        ...(product.supplier_ref   ? { supplier_ref:   product.supplier_ref }   : {}),
        ...(farm                   ? { farm }                                    : {}),
        source: 'oz_export',
        ...(!existing.colors?.length && colors ? { colors } : {}),
        ...(!existing.image_url && product.image_url ? { image_url: product.image_url } : {}),
        ...((!existing.display_name || displayNameIsRaw) && display_name ? { display_name } : {}),
      })
      .eq('id', existing.id)

    if (error) { console.error('UPDATE ERR:', item.name, error.message); errors++ }
    else { process.stdout.write('u'); updated++ }
  } else {
    const { error } = await supabase.from('products').insert(product)
    if (error) { console.error('\nINSERT ERR:', item.name, error.message); errors++ }
    else { process.stdout.write('.'); inserted++ }
  }
}

console.log(`\n\nГотово: +${inserted} новых, ~${updated} обновлено, ${errors} ошибок`)

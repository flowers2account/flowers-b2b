// import-oz-alstro.mjs
// Импорт альстромерий OZ (новый формат парсера) из JSONL + display_name.
// Запуск: node --env-file=.env.local scripts/import-oz-alstro.mjs [path/to/file.jsonl]
//
// Новый формат парсера: oz_product_code, colors[], image_url, country_iso — уже распарсены.

import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

const JSONL_PATH = process.argv[2] || 'C:\\Users\\Владелец\\Desktop\\oz-parser-new\\output\\Alstroemeria.jsonl'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

// ── Перевод display_name ──────────────────────────────────────────────────────

const DISPLAY_NAMES = {
  // из TM
  'alstroemeria casanova':              'Альстромерия «Казанова»',
  // короткие (Alstro)
  'alstro carline':                     'Альстромерия «Карлайн»',
  'alstro dancing queen':               'Альстромерия «Дансинг Квин»',
  'alstro estee':                       'Альстромерия «Эсти»',
  'alstro nadya':                       'Альстромерия «Надя»',
  'alstro panorama':                    'Альстромерия «Панорама»',
  'alstro rome':                        'Альстромерия «Рим»',
  'alstro virginia':                    'Альстромерия «Вирджиния»',
  // полные (Alstroemeria)
  'alstroemeria annabelle':             'Альстромерия «Аннабель»',
  'alstroemeria aurora':                'Альстромерия «Аврора»',
  'alstroemeria avianna':               'Альстромерия «Авиана»',
  'alstroemeria bali':                  'Альстромерия «Бали»',
  'alstroemeria bikini':                'Альстромерия «Бикини»',
  'alstroemeria bubblicious':           'Альстромерия «Баблишес»',
  'alstroemeria carline':               'Альстромерия «Карлайн»',
  'alstroemeria dancing queen':         'Альстромерия «Дансинг Квин»',
  'alstroemeria elegance':              'Альстромерия «Элеганс»',
  'alstroemeria estee':                 'Альстромерия «Эсти»',
  'alstroemeria falipo':                'Альстромерия «Фалипо»',
  'alstroemeria fashionista couture':   'Альстромерия «Фэшиониста Кутюр»',
  // серия Charmelia FL
  'alstroemeria fl charmelia alba':     'Альстромерия «Чармелия Альба»',
  'alstroemeria fl charmelia apricot':  'Альстромерия «Чармелия Абрикос»',
  'alstroemeria fl charmelia blanca':   'Альстромерия «Чармелия Бланка»',
  'alstroemeria fl charmelia pink':     'Альстромерия «Чармелия Пинк»',
  'alstroemeria fl charmelia purplex':  'Альстромерия «Чармелия Пурплекс»',
  'alstroemeria fl charmelia white':    'Альстромерия «Чармелия Вайт»',
  'alstroemeria fl coral':              'Альстромерия «Корал»',
  'alstroemeria fl jade':               'Альстромерия «Джейд»',
}

// ── Нормализация цветов (новый формат → ключи нашей палитры) ─────────────────

const COLOR_NORM = {
  'white':         'white',
  'cream':         'cream',
  'ivory':         'cream',
  'yellow':        'yellow',
  'orange':        'orange',
  'orange_yellow': 'yellow_orange',
  'yellow_orange': 'yellow_orange',
  'apricot':       'peach',
  'salmon':        'peach',
  'peach':         'peach',
  'coral':         'coral',
  'red':           'red',
  'dark_red':      'burgundy',
  'burgundy':      'burgundy',
  'pink':          'pink',
  'light_pink':    'light_pink',
  'hot_pink':      'hot_pink',
  'fuchsia':       'hot_pink',
  'cerise':        'hot_pink',
  'purple':        'purple',
  'lilac':         'lilac',
  'lilac_dark':    'lilac_dark',
  'lavender':      'lavender',
  'blue':          'blue',
  'green':         'green',
  'silver':        'silver',
  'grey':          'silver',
  'brown':         'brown',
  'black':         'black',
  'multicolor':    'multicolor',
  'mixed':         'multicolor',
  'bicolor':       'bicolor',
}

function fixPhotoUrl(url) {
  if (!url) return null
  return url.replace(/image\/fetch\/[^/]+\//, 'image/fetch/f_auto,q_auto/')
}

function normalizeColors(arr) {
  if (!arr?.length) return null
  const mapped = arr.map(c => COLOR_NORM[c.toLowerCase()] ?? c).filter(Boolean)
  return mapped.length ? mapped : null
}

// ── Чтение и дедупликация ─────────────────────────────────────────────────────

const raw = fs.readFileSync(JSONL_PATH, 'utf-8').replace(/^﻿/, '')
const allRows = raw.split('\n').filter(Boolean).map(l => JSON.parse(l))

const QUALITY_RANK = { 'AA': 2, 'A1': 1 }
const deduped = new Map()
for (const r of allRows) {
  const key = r.name?.toLowerCase()
  if (!key) continue
  const prev = deduped.get(key)
  if (!prev || (QUALITY_RANK[r.quality_grade] ?? 0) > (QUALITY_RANK[prev.quality_grade] ?? 0)) {
    deduped.set(key, r)
  }
}
const items = [...deduped.values()]
console.log(`\n[OZ Alstroemeria] записей: ${allRows.length} → после дедупликации: ${items.length}`)

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

  const product = {
    name:               item.name,
    category:           'cut',
    subcategory:        'alstroemeria',
    length_cm:          item.length_cm ?? null,
    country_iso:        item.country_iso ?? 'NL',
    colors,
    image_url:          fixPhotoUrl(item.image_url),
    qty:                999,
    pack_size:          item.pack_size ?? 10,
    stems_per_pack:     item.stems_per_pack ?? null,
    weight_gram:        item.weight_gram ?? null,
    quality_grade:      item.quality_grade ?? null,
    container_code:     item.container_code ?? null,
    price:              999,
    is_active:          true,
    arrival_date:       today,
    farm:               item.farm ?? null,
    supplier_ref:       item.oz_product_code ?? null,
    source:             'oz_export',
    ...(display_name ? { display_name } : {}),
  }

  const { data: rows } = await supabase
    .from('products')
    .select('id, display_name, colors, image_url')
    .ilike('name', item.name)
    .limit(1)
  const existing = rows?.[0] ?? null

  if (existing) {
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
        source: 'oz_export',
        ...(!existing.colors?.length && colors  ? { colors }                    : {}),
        ...(!existing.image_url && product.image_url ? { image_url: product.image_url } : {}),
        ...((!existing.display_name || existing.display_name === existing.name) && display_name ? { display_name } : {}),
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

// import-waterdrinker.mjs
// Импорт каталога Waterdrinker из JSONL в products
// Запуск: node --env-file=.env.local scripts/import-waterdrinker.mjs [CategoryName]
// Пример: node --env-file=.env.local scripts/import-waterdrinker.mjs Anthurium

import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

const JSONL_PATH = 'C:\\Users\\Владелец\\Desktop\\waterdrinker-scraper\\output\\waterdrinker_catalog.jsonl'
const CATEGORY_FILTER = process.argv[2] || 'Anthurium'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

// ── Маппинги ──────────────────────────────────────────────────────────────────

const DUTCH_COLOR = {
  'wit':              'white',
  'creme':            'cream',
  'geel':             'yellow',
  'oranje':           'orange',
  'zalm':             'peach',
  'koraal':           'coral',
  'rood':             'red',
  'bordeaux':         'burgundy',
  'roze':             'pink',
  'felroze':          'hot_pink',
  'lila':             'lilac',
  'lavendel':         'lavender',
  'paars':            'purple',
  'blauw':            'blue',
  'donkerblauw':      'navy',
  'groen':            'green',
  'lichtgroen':       'lime',
  'zilver':           'silver',
  'bruin':            'brown',
  'terracotta':       'terracotta',
  'zwart':            'black',
  'roze-rood':        'pink',
  'rood bruin':       'terracotta',
  'rood wit':         'bicolor',
  'zalmroze':         'peach',
  'licht geel':       'yellow',
  'pastel':           'cream',
  'licht roze':       'pink',
  'donker rood':      'burgundy',
  'licht paars':      'lilac',
  'licht blauw':      'blue',
}

const SUBCAT_MAP = {
  'Anthurium':                    'anthuriums',
  'Orchids':                      'orchids',
  'Kalanchoe':                    'flowering',
  'Spathiphyllum':                'flowering',
  'Hydrangea Indoor':             'hydrangeas',
  'Bromelia':                     'flowering',
  'Begonia':                      'flowering',
  'Roses Indoor':                 'roses',
  'Dracaena':                     'green',
  'Hedera Indoor':                'green',
  'Palms':                        'green',
  'Calathea':                     'green',
  'Large Leaved Plants':          'green',
  'Polyscias / Pachira / Yucca':  'large',
  'Flowering Houseplants Other':  'flowering',
  'Succulents':                   'succulents',
  'Bulbs':                        'flowering',
  'Helleborus':                   'flowering',
  'Climbingplants':               'green',
  'Ficus':                        'green',
  'Chrysant':                     'flowering',
  'Trees':                        'large',
}

// ── Утилиты ───────────────────────────────────────────────────────────────────

function getAttr(attrs, code) {
  return attrs?.find(a => a.code === code)?.value ?? null
}

function parseCm(val) {
  if (!val) return null
  const m = String(val).match(/(\d+(?:\.\d+)?)/)
  return m ? parseFloat(m[1]) : null
}

function parseColor(dutch) {
  if (!dutch) return null
  const c = dutch.toLowerCase().trim()
  if (/gemengd|diverse|mix|meerdere/.test(c)) return 'multicolor'
  return DUTCH_COLOR[c] ?? null
}

function parseCountry(val) {
  if (!val) return 'NL'
  const v = val.toLowerCase()
  if (v.includes('netherlands') || v.includes('holland')) return 'NL'
  if (v.includes('ecuador'))   return 'EC'
  if (v.includes('kenya'))     return 'KE'
  if (v.includes('colombia'))  return 'CO'
  if (v.includes('ethiopia'))  return 'ET'
  if (v.includes('israel'))    return 'IL'
  if (v.includes('china'))     return 'CN'
  return 'NL'
}

// ── Основной импорт ───────────────────────────────────────────────────────────

const raw = fs.readFileSync(JSONL_PATH, 'utf-8')
const all = raw.split('\n').filter(Boolean).map(l => JSON.parse(l))
const items = all.filter(r => r._category_name === CATEGORY_FILTER)

console.log(`\n[Waterdrinker] Категория: ${CATEGORY_FILTER}, записей: ${items.length}\n`)

let inserted = 0, updated = 0, errors = 0
const today = new Date().toISOString().split('T')[0]

for (const item of items) {
  const potRaw    = getAttr(item.mainAttributes, 'S01')
  const heightRaw = getAttr(item.mainAttributes, 'S02')
  const colorRaw  = getAttr(item.attributes, 'S50') ?? getAttr(item.attributes, 'B01')
  const countryRaw= getAttr(item.attributes,     'S62')

  const color     = parseColor(colorRaw)
  const subcategory = SUBCAT_MAP[item._category_name] ?? 'flowering'

  // Включаем размер горшка в name — разные горшки это разные SKU
  const skuName = potRaw ? `${item.name} ${potRaw}` : item.name

  const product = {
    name:                skuName,
    category:            'pot',
    subcategory,
    pot_diameter:        parseCm(potRaw),
    length_cm:           parseCm(heightRaw),
    country_iso:         parseCountry(countryRaw),
    colors:              color ? [color] : null,
    image_url:           item.pictures?.[0] ?? null,
    campaign_image_url:  item.pictures?.[1] ?? null,
    qty:                 item.stock ?? 0,
    pack_size:           1,
    price:               null,
    is_active:           (item.stock ?? 0) > 0,
    arrival_date:        today,
  }

  // Проверяем, есть ли уже в БД
  const { data: existing } = await supabase
    .from('products')
    .select('id, display_name')
    .eq('name', skuName)
    .maybeSingle()

  if (existing) {
    // UPDATE — только qty, is_active, не трогаем display_name и ручные правки
    const { data: cur } = await supabase
      .from('products')
      .select('display_name, colors')
      .eq('id', existing.id)
      .single()

    const { error } = await supabase
      .from('products')
      .update({
        qty:       product.qty,
        is_active: product.is_active,
        ...(!cur?.colors?.length && product.colors ? { colors: product.colors } : {}),
        ...(cur?.display_name ? {} : {
          image_url:          product.image_url,
          campaign_image_url: product.campaign_image_url,
        }),
      })
      .eq('id', existing.id)

    if (error) { console.error('UPDATE ERR:', item.name, error.message); errors++ }
    else { process.stdout.write('u'); updated++ }
  } else {
    // INSERT
    const { error } = await supabase.from('products').insert(product)
    if (error) { console.error('\nINSERT ERR:', item.name, error.message); errors++ }
    else { process.stdout.write('.'); inserted++ }
  }
}

console.log(`\n\nГотово: +${inserted} новых, ~${updated} обновлено, ${errors} ошибок`)

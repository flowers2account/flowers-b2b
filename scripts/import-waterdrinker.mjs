// import-waterdrinker.mjs  (формат парсера v2)
// Запуск: node --env-file=.env.local scripts/import-waterdrinker.mjs [CategoryName|ALL] [path/to/file.jsonl]

import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

const DEFAULT_JSONL = 'C:\\Users\\Владелец\\Desktop\\waterdrinker-v2-parser\\output\\waterdrinker_catalog_v2.jsonl'
const JSONL_PATH      = process.argv[3] || DEFAULT_JSONL
const CATEGORY_FILTER = process.argv[2] || 'ALL'

const SKIP_CATEGORIES = new Set(['Bonsai'])

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

// ── Маппинги ──────────────────────────────────────────────────────────────────

const DUTCH_COLOR = {
  'wit':           'white',
  'creme':         'cream',
  'pastel':        'cream',
  'geel':          'yellow',
  'licht geel':    'yellow',
  'oranje':        'orange',
  'zalm':          'peach',
  'zalmroze':      'peach',
  'koraal':        'coral',
  'rood':          'red',
  'bordeaux':      'burgundy',
  'donker rood':   'burgundy',
  'roze':          'pink',
  'licht roze':    'light_pink',
  'roze-rood':     'pink',
  'felroze':       'hot_pink',
  'lila':          'lilac',
  'licht paars':   'lilac',
  'lavendel':      'lavender',
  'paars':         'purple',
  'blauw':         'blue',
  'licht blauw':   'blue',
  'donkerblauw':   'navy',
  'groen':         'green',
  'lichtgroen':    'lime',
  'zilver':        'silver',
  'bruin':         'brown',
  'rood bruin':    'terracotta',
  'terracotta':    'terracotta',
  'zwart':         'black',
  'rood wit':      'bicolor',
}

const SUBCAT_MAP = {
  'Anthurium':                       'anthuriums',
  'Orchids':                         'orchids',
  'Kalanchoe':                       'kalanchoe',
  'Spathiphyllum':                   'spathiphyllum',
  'Hydrangea Indoor':                'hydrangeas_indoor',
  'Bromelia':                        'bromeliads',
  'Begonia':                         'begonias',
  'Roses Indoor':                    'roses_indoor',
  'Dracaena':                        'dracaena',
  'Hedera Indoor':                   'hedera',
  'Palms':                           'palms',
  'Calathea':                        'calathea',
  'Large Leaved Plants':             'large_leaved',
  'Polyscias / Pachira / Yucca':     'polyscias',
  'Flowering Houseplants Other':     'flowering',
  'Succulents':                      'succulents',
  'Bulbs':                           'bulbs_indoor',
  'Helleborus':                      'helleborus',
  'Climbingplants':                  'climbing_plants',
  'Ficus':                           'ficus',
  'Chrysant':                        'chrysanthemums_pot',
  'Trees':                           'trees',
  'Buxus':                           'buxus',
  'Water plants and pond plants':    'aquatic',
  'Rhododendron / Azalea Outdoor':   'rhododendrons',
  'Carnivorous Plants':              'carnivorous',
  'Beddingplants Other':             'bedding',
  'Viola / Pansy':                   'viola',
  'Herbs':                           'herbs',
  'Hebe':                            'hebe',
  'Lavender':                        'lavender_plant',
  'Roses Outdoor':                   'roses_outdoor',
  'Calluna / Erica':                 'heather',
  'Vegetable Plants':                'vegetables',
  'Hedera Outdoor':                  'hedera_outdoor',
  'Hydrangea Outdoor':               'hydrangeas_outdoor',
  'Fruitplants':                     'fruit_plants',
  'Grasses and Bamboo':              'ornamental_grasses',
  'Perennial Plants Other':          'perennials',
  'Azalea Indoor':                   'azalea_indoor',
  'Cacti':                           'cacti',
  'Ferns':                           'ferns',
  'Zamioculcas':                     'zamioculcas',
  'Green Houseplants Other':         'green',
  'Cyclamen':                        'cyclamen',
  'Poinsettia':                      'poinsettia',
  'Hedging Plants':                  'hedging',
  'Conifer':                         'conifers',
  'Gaultheria':                      'gaultheria',
  'Skimmia':                         'skimmia',
  'Shrubs other':                    'outdoor',
  'Fuchsia':                         'fuchsia',
  'Geranium':                        'geranium',
  'Patio Plants':                    'patio_plants',
}

// ── Утилиты ───────────────────────────────────────────────────────────────────

function parseColor(dutch) {
  if (!dutch) return null
  const c = dutch.toLowerCase().trim()
  if (/gemengd|diverse|mix|meerdere/.test(c)) return 'multicolor'
  return DUTCH_COLOR[c] ?? null
}

function parseCountry(val) {
  if (!val) return 'NL'
  const v = val.toLowerCase()
  if (v.includes('nederland') || v.includes('netherlands') || v.includes('holland')) return 'NL'
  if (v.includes('ecuador'))   return 'EC'
  if (v.includes('kenya'))     return 'KE'
  if (v.includes('colombia'))  return 'CO'
  if (v.includes('ethiopia'))  return 'ET'
  if (v.includes('israel'))    return 'IL'
  if (v.includes('china'))     return 'CN'
  return 'NL'
}

// ── Основной импорт ───────────────────────────────────────────────────────────

const raw  = fs.readFileSync(JSONL_PATH, 'utf-8').replace(/^﻿/, '')
const all  = raw.split('\n').filter(Boolean).map(l => JSON.parse(l))
const isAll = CATEGORY_FILTER === 'ALL'

const items = isAll
  ? all.filter(r => !SKIP_CATEGORIES.has(r.category_name))
  : all.filter(r => r.category_name === CATEGORY_FILTER)

if (isAll) {
  const cats = [...new Set(items.map(r => r.category_name))]
  console.log(`\n[Waterdrinker v2] Все категории (${cats.length}): ${cats.join(', ')}`)
  console.log(`Всего записей: ${items.length}\n`)
} else {
  console.log(`\n[Waterdrinker v2] Категория: ${CATEGORY_FILTER}, записей: ${items.length}\n`)
}

let inserted = 0, updated = 0, errors = 0
const today = new Date().toISOString().split('T')[0]

for (const item of items) {
  const name    = item.name?.trim() ?? ''
  const skuName = item.pot_size ? `${name} ${item.pot_size}` : name
  const color   = parseColor(item.color)
  const subcategory = SUBCAT_MAP[item.category_name] ?? 'flowering'

  const product = {
    name:                skuName,
    category:            'pot',
    subcategory,
    pot_diameter:        item.pot_size   ?? null,
    length_cm:           item.height     ?? null,
    country_iso:         parseCountry(item.country),
    colors:              color ? [color] : null,
    image_url:           item.images?.[0] ?? null,
    campaign_image_url:  item.images?.[1] ?? null,
    qty:                 0,
    pack_size:           item.stems      ?? 1,
    stems_per_pack:      item.stems      ?? null,
    price:               null,
    is_active:           false,
    arrival_date:        today,
    supplier_ref:        item.id ? String(item.id) : null,
    farm:                item.supplier_info ?? null,
    container_code:      item.packing_units ?? null,
    quality_grade:       item.quality    ?? null,
    min_plants_per_pot:  item.min_plants ?? null,
    min_flowers_per_pot: item.min_flowers ?? null,
    pot_color:           item.pot_color   ?? null,
    pot_material:        item.pot_material ?? null,
    pot_form:            item.pot_form   ?? null,
    substrate:           item.substrate  ?? null,
  }

  const { data: existing } = await supabase
    .from('products')
    .select('id, colors, image_url')
    .eq('name', skuName)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase
      .from('products')
      .update({
        pot_diameter:        product.pot_diameter,
        length_cm:           product.length_cm,
        country_iso:         product.country_iso,
        pack_size:           product.pack_size,
        stems_per_pack:      product.stems_per_pack,
        supplier_ref:        product.supplier_ref,
        farm:                product.farm,
        container_code:      product.container_code,
        quality_grade:       product.quality_grade,
        min_plants_per_pot:  product.min_plants_per_pot,
        min_flowers_per_pot: product.min_flowers_per_pot,
        pot_color:           product.pot_color,
        pot_material:        product.pot_material,
        pot_form:            product.pot_form,
        substrate:           product.substrate,
        ...(!existing.colors?.length && product.colors ? { colors: product.colors } : {}),
        ...(!existing.image_url && product.image_url ? {
          image_url:          product.image_url,
          campaign_image_url: product.campaign_image_url,
        } : {}),
      })
      .eq('id', existing.id)

    if (error) { console.error('UPDATE ERR:', skuName, error.message); errors++ }
    else { process.stdout.write('u'); updated++ }
  } else {
    const { error } = await supabase.from('products').insert(product)
    if (error) { console.error('\nINSERT ERR:', skuName, error.message); errors++ }
    else { process.stdout.write('.'); inserted++ }
  }
}

console.log(`\n\nГотово: +${inserted} новых, ~${updated} обновлено, ${errors} ошибок`)

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
  'donkerpaars':   'purple',
  'driekleurig':   'multicolor',
  'diverse kleuren': 'multicolor',
  'gemengde kleuren': 'multicolor',
  'geel oranje':     'yellow_orange',
  'tweekleurig':     'bicolor',
  'roze wit':        'bicolor',
  'abrikoos':        'peach',
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
  'Green Houseplants Other?Products=1': 'green',
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
  // Русские названия категорий (серия 180xxx)
  'Лаванда':                         'lavender_plant',
  'Декоративные Травы И Бамбук':     'ornamental_grasses',
  'Многолетники Разные':             'perennials',
  'Фруктовые Растения':              'fruit_plants',
  'Пряные Травы':                    'herbs',
  'Деревья':                         'trees',
  'Буксус':                          'buxus',
  'Кониферены':                      'conifers',
  'Хедера':                          'hedera_outdoor',
  'Гортензия Уличная':               'hydrangeas_outdoor',
  'Вьющиеся Растения':               'climbing_plants',
  'Вьющиеся Растения?Products=1':    'climbing_plants',
  'Роза':                            'roses_outdoor',
  'Роза?Products=1':                 'roses_outdoor',
  'Кустарники Разные':               'outdoor',
  'Кустарники Разные?Products=1':    'outdoor',
  'Фуксия':                          'fuchsia',
  'Растения Для Садовых Кадок':      'patio_plants',
  'Растения Для Клумб Разные':       'bedding',
  // Расходники (серия 240xxx и др.)
  'Общая Коллекция':                 'general_collection',
  'Общая Коллекция?Products=1':      'general_collection',
  'Горшки':                          'pots_accessories',
  'Горшки?Products=1':               'pots_accessories',
  'Искусственные Цветы':             'artificial_flowers',
  'Искусственные Цветы?Products=1':  'artificial_flowers',
  'Предметы Флористики':             'floristry_items',
  'Предметы Флористики?Products=1':  'floristry_items',
  'Вазы':                            'vases',
  'Вазы?Products=1':                 'vases',
  'Корзины':                         'baskets',
  'Корзины?Products=1':              'baskets',
  'Фонари':                          'lanterns',
  'Фонари?Products=1':               'lanterns',
  'Аксессуары Для Дома':             'home_accessories',
  'Аксессуары Для Дома?Products=1':  'home_accessories',
  'Композиции':                      'compositions',
  'Композиции?Products=1':           'compositions',
}

// Субкатегории расходников → category: 'accessories'
const ACCESSORIES_SUBCATS = new Set([
  'general_collection', 'pots_accessories', 'artificial_flowers',
  'floristry_items', 'vases', 'baskets', 'lanterns', 'home_accessories',
])

// Фоллбэк для корневых категорий (по роду растения)
const GENUS_SUBCAT = {
  'Aloe':        'succulents',
  'Agave':       'succulents',
  'Adenium':     'succulents',
  'Aeonium':     'succulents',
  'Aechmea':     'bromeliads',
  'Aglaonema':   'green',
  'Alocasia':    'large_leaved',
  'Adiantum':    'ferns',
  'Aglaomorpha': 'ferns',
  'Albuca':      'bulbs_indoor',
  'Aliceara':    'orchids',
  'Allium':      'bulbs_indoor',
}

// ── Утилиты ───────────────────────────────────────────────────────────────────

function parseColor(dutch) {
  if (!dutch) return null
  const c = dutch.toLowerCase().trim()
  if (/gemengd|diverse|mix|meerdere|driekleurig/.test(c)) return 'multicolor'
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
  if (v.includes('denemarken') || v.includes('denmark')) return 'DK'
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
  // Skip placeholder/garbage entries from Waterdrinker
  if (item.variant && item.variant.startsWith('Введите здесь')) { process.stdout.write('s'); continue }

  const name    = item.name?.trim() ?? ''
  const skuName = item.pot_size ? `${name} ${item.pot_size}` : name
  const color   = parseColor(item.color)
  const genus   = item.name?.trim().split(/\s+/)[0] ?? ''
  let subcategory = SUBCAT_MAP[item.category_name] ?? GENUS_SUBCAT[genus] ?? 'flowering'

  // Override subcategory by variant type (e.g. POT/MUG inside Вазы category)
  if (item.variant) {
    const vt = item.variant.toUpperCase()
    if (/\bPOT\b|\bMUG\b/.test(vt))  subcategory = 'pots_accessories'
    else if (/\bBASKET\b/.test(vt))   subcategory = 'baskets'
    else if (/\bLANTERN\b/.test(vt))  subcategory = 'lanterns'
    else if (/\bVASE\b/.test(vt))     subcategory = 'vases'
  }

  // Use supplier_ref (item.id) as DB name key for uniqueness; display_name holds human-readable name
  const dbName = item.id ? String(item.id) : skuName

  const product = {
    name:                dbName,
    display_name:        skuName,
    category:            ACCESSORIES_SUBCATS.has(subcategory) ? 'accessories' : 'pot',
    subcategory,
    pot_diameter:        item.pot_size   ?? null,
    length_cm:           item.height     ?? null,
    country_iso:         parseCountry(item.country),
    colors:              color ? [color] : null,
    image_url:           item.images?.[0] ?? null,
    campaign_image_url:  item.images?.[1] ?? null,
    qty:                 555,
    pack_size:           item.stems      ?? 1,
    stems_per_pack:      item.stems      ?? null,
    price:               555,
    is_active:           true,
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
    variant:             (item.variant && item.variant.length <= 60) ? item.variant : null,
    source:              'waterdrinker',
  }

  // Dedup: prefer supplier_ref (unique per WD product); fallback to name for legacy imports
  let existing = null
  if (item.id) {
    const { data } = await supabase.from('products').select('id, colors, image_url, subcategory').eq('supplier_ref', String(item.id)).maybeSingle()
    existing = data
    if (!existing) {
      // Legacy fallback: find by name only if the record has no supplier_ref yet
      const { data: byName } = await supabase.from('products').select('id, colors, image_url, supplier_ref').eq('name', skuName).maybeSingle()
      if (byName && !byName.supplier_ref) existing = byName
    }
  } else {
    const { data } = await supabase.from('products').select('id, colors, image_url').eq('name', skuName).maybeSingle()
    existing = data
  }

  if (existing) {
    const { error } = await supabase
      .from('products')
      .update({
        category:            product.category,
        subcategory:         product.subcategory,
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
        variant:             product.variant,
        source:              'waterdrinker',
        ...(!existing.colors?.length && product.colors ? { colors: product.colors } : {}),
        // Force-update photo when subcategory changes (product moved from another category)
        ...(((!existing.image_url || existing.subcategory !== product.subcategory) && product.image_url) ? {
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

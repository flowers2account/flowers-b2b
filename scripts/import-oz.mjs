// import-oz.mjs
// Импорт каталога OZ Export (срез) из JSONL в products
// Запуск: node --env-file=.env.local scripts/import-oz.mjs [CategoryName|ALL] [path/to/file.jsonl]

import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

const DEFAULT_JSONL = 'C:\\Users\\Владелец\\Desktop\\waterdrinker-scraper\\output\\oz_export_cut_flowers.jsonl'
const JSONL_PATH      = process.argv[3] || DEFAULT_JSONL
const CATEGORY_FILTER = process.argv[2] || 'ALL'

const SKIP_CATEGORIES = new Set(['Bouquets', 'Artificial Flowers'])

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

// ── Маппинги ──────────────────────────────────────────────────────────────────

const OZ_COLOR = {
  'white':        'white',
  'cream':        'cream',
  'ivory':        'cream',
  'champagne':    'cream',
  'yellow':       'yellow',
  'orange':       'orange',
  'apricot':      'peach',
  'salmon':       'peach',
  'salmon-pink':  'peach',
  'peach':        'peach',
  'coral':        'coral',
  'orange-red':   'coral',
  'red':          'red',
  'dark red':     'burgundy',
  'red dark':     'burgundy',
  'burgundy':     'burgundy',
  'aubergine':    'burgundy',
  'bordeaux':     'burgundy',
  'pink':         'pink',
  'light pink':   'light_pink',
  'pink light':   'light_pink',
  'pink old':     'pink',
  'pink dark':    'pink',
  'pink white':   'bicolor_pink_white',
  'pink/white':   'bicolor_pink_white',
  'hot pink':     'hot_pink',
  'fuchsia':      'hot_pink',
  'cerise':       'hot_pink',
  'purple':       'purple',
  'purple dark':  'purple',
  'violet':       'purple',
  'lilac':        'lilac',
  'lilac dark':   'lilac_dark',
  'milka':        'lilac',
  'lavender':     'lavender',
  'blue':         'blue',
  'light blue':   'blue',
  'dark blue':    'navy',
  'green':        'green',
  'bronze':       'terracotta',
  'grey':         'silver',
  'brown':        'brown',
  'black':        'black',
  'orange light': 'light_orange',
  'yellow-orange':'yellow_orange',
  'bicolor':      'bicolor',
  'bicolour':     'bicolor',
  'blue/white':   'bicolor_blue_white',
  'orange/green': 'bicolor_orange_green',
  'orange/yellow':'bicolor_orange_yellow',
  'red/white':    'bicolor_red_white',
  'red/yellow':   'bicolor_red_yellow',
  'white green':  'bicolor_white_green',
  'white/green':  'bicolor_white_green',
  'mixed':        'multicolor',
  'mix':          'multicolor',
  'multicolor':   'multicolor',
}

const SUBCAT_MAP = {
  'Alstroemeria':           'alstroemeria',
  'Antirrhinum':            'antirrhinum',
  'Aster':                  'asters',
  'Astilbe':                'astilbe',
  'Bouvardia':              'bouvardia',
  'Chrysanthemum':          'chrysanthemums',
  'Cymbidium':              'orchids',
  'Delphinium':             'delphiniums',
  'Dianthus':               'carnations',
  'Eryngium':               'eryngium',
  'Exotics':                'exotic',
  'Freesia':                'freesia',
  'Gerbera/Germini':        'gerberas',
  'Hydrangea':              'hydrangeas',
  'Hypericum':              'berries',
  'Iris':                   'irises',
  'Lilium':                 'lilies',
  'Matthiola':              'matthiola',
  'Orchids':                'orchids',
  'Paeonia':                'peonies',
  'Ranunculus':             'ranunculus',
  'Rosa':                   'roses',
  'Rosa Ecuador':           'roses',
  'Solidago':               'fillers',
  'Syringa/Viburnum':       'branches',
  'Tulipa':                 'tulips',
  'Veronica':               'fillers',
  'Zantedeschia/Calla':     'callas',
  'Paint/Wax':              'texture',
  'Gypsophila':             'fillers',
  'Limonium/Statice':       'fillers',
  'Phalaenopsis/Vanda':     'orchids',
  'Protea/Nutans':          'proteas',
  'Chamelaucium/Waxflower': 'waxflower',
  'Branches/Wood':          'branches',
  'Anthuriums':             'anthuriums',
  'Lisianthus/Eustoma':     'lisianthus',
  'Dahlia':                 'dahlia',
  'Allium':                 'allium',
  'Celosia':                'celosia',
  'Campanula':              'campanula',
  'Fritillaria':            'fritillaria',
  'Helianthus':             'sunflowers',
  'Lathyrus':               'lathyrus',
}

// ── Утилиты ───────────────────────────────────────────────────────────────────

function parseColor(val) {
  if (!val) return null
  const v = val.toLowerCase().trim()
  if (/mix|multi|diverse/.test(v)) return 'multicolor'
  if (OZ_COLOR[v]) return OZ_COLOR[v]
  if (/\w+[/ ]\w+/.test(v)) return 'bicolor'
  return null
}

function fixPhotoUrl(url) {
  if (!url) return null
  // Remove Cloudinary size constraints → full resolution
  return url.replace(/image\/fetch\/[^/]+\//, 'image/fetch/f_auto,q_auto/')
}

// ── Основной импорт ───────────────────────────────────────────────────────────

const raw   = fs.readFileSync(JSONL_PATH, 'utf-8').replace(/^﻿/, '')
const all   = raw.split('\n').filter(Boolean).map(l => JSON.parse(l))
const isAll = CATEGORY_FILTER === 'ALL'

const items = isAll
  ? all.filter(r => !SKIP_CATEGORIES.has(r.category))
  : all.filter(r => r.category === CATEGORY_FILTER)

if (isAll) {
  const cats = [...new Set(items.map(r => r.category))]
  console.log(`\n[OZ Export] Все категории (${cats.length}): ${cats.join(', ')}`)
  console.log(`Всего записей: ${items.length}\n`)
} else {
  console.log(`\n[OZ Export] Категория: ${CATEGORY_FILTER}, записей: ${items.length}\n`)
}

let inserted = 0, updated = 0, errors = 0
const today = new Date().toISOString().split('T')[0]

for (const item of items) {
  const subcategory    = SUBCAT_MAP[item.category] ?? 'exotic'
  const color          = parseColor(item.color_line)
  const isEcuador      = item.category === 'Rosa Ecuador'
  const isRosaGarden   = item.name?.startsWith('Rosa Garden') || item.name?.startsWith('Rosa Large') || item.name?.startsWith('Rosa Austin')
  const isRosaSpray    = item.name?.startsWith('Rosa Spray')

  const product = {
    name:               item.name,
    category:           'cut',
    subcategory,
    variety_type:       isEcuador ? 'single' : isRosaGarden ? 'decorative' : isRosaSpray ? 'spray' : null,
    length_cm:          item.height_cm ?? null,
    country_iso:        isEcuador ? 'EC' : 'NL',
    colors:             color ? [color] : null,
    image_url:          fixPhotoUrl(item.image_urls?.[0]),
    campaign_image_url: fixPhotoUrl(item.image_urls?.[1]),
    qty:                999,
    pack_size:          item.quantity_stems ?? 1,
    stems_per_pack:     item.quantity_stems ?? null,
    weight_gram:        item.weight_gram ?? null,
    price:              999,
    is_active:          true,
    arrival_date:       today,
    farm:               item.producer ?? null,
    supplier_ref:       item.id ?? null,
  }

  const { data: existing } = await supabase
    .from('products')
    .select('id, display_name, colors, image_url')
    .eq('name', item.name)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase
      .from('products')
      .update({
        qty:            product.qty,
        is_active:      product.is_active,
        subcategory:    product.subcategory,
        length_cm:      product.length_cm,
        country_iso:    product.country_iso,
        pack_size:      product.pack_size,
        stems_per_pack: product.stems_per_pack,
        ...(product.weight_gram ? { weight_gram: product.weight_gram } : {}),
        ...(product.variety_type ? { variety_type: product.variety_type } : {}),
        ...(product.supplier_ref ? { supplier_ref: product.supplier_ref } : {}),
        ...(!existing.colors?.length && product.colors ? { colors: product.colors } : {}),
        ...(!existing.image_url && product.image_url ? {
          image_url:          product.image_url,
          campaign_image_url: product.campaign_image_url,
        } : {}),
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

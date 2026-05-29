// fetch-product-photos.mjs
// Ищет фото товаров через Google Custom Search API и сохраняет в products.extra_images
//
// Запуск:
//   node --env-file=.env.local scripts/fetch-product-photos.mjs [category] [subcategory]
//
// Примеры:
//   node --env-file=.env.local scripts/fetch-product-photos.mjs pot anthuriums
//   node --env-file=.env.local scripts/fetch-product-photos.mjs cut roses
//   node --env-file=.env.local scripts/fetch-product-photos.mjs accessories baskets
//   node --env-file=.env.local scripts/fetch-product-photos.mjs pot ALL
//
// ⚠️  Google Custom Search: 100 запросов/день бесплатно, далее $5 за 1000
// Скрипт пропускает товары у которых extra_images уже заполнен

import { createClient } from '@supabase/supabase-js'

const CATEGORY   = process.argv[2] || 'ALL'
const SUBCATEGORY = process.argv[3] || 'ALL'
const DELAY_MS   = 1200  // пауза между запросами (Google rate limit)
const IMAGES_PER_PRODUCT = 3  // сколько фото сохранять на товар

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY
const GOOGLE_CX      = process.env.GOOGLE_CX

if (!GOOGLE_API_KEY || !GOOGLE_CX) {
  console.error('❌ Не заданы GOOGLE_API_KEY или GOOGLE_CX в .env.local')
  process.exit(1)
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

// Маппинг подкатегорий на английские поисковые термины
const SUBCAT_EN = {
  anthuriums:          'Anthurium',
  orchids:             'Phalaenopsis orchid',
  kalanchoe:           'Kalanchoe',
  spathiphyllum:       'Spathiphyllum peace lily',
  hydrangeas_indoor:   'Hydrangea indoor plant',
  bromeliads:          'Bromeliad plant',
  begonias:            'Begonia flowering plant',
  roses_indoor:        'Rose indoor plant',
  dracaena:            'Dracaena plant',
  hedera:              'Hedera ivy plant',
  palms:               'Palm plant',
  calathea:            'Calathea plant',
  large_leaved:        'Large leaf tropical plant',
  polyscias:           'Polyscias plant',
  flowering:           'flowering houseplant',
  succulents:          'Succulent plant',
  bulbs_indoor:        'Bulb plant indoor',
  helleborus:          'Helleborus',
  climbing_plants:     'Climbing plant',
  ficus:               'Ficus plant',
  chrysanthemums_pot:  'Chrysanthemum pot plant',
  trees:               'Decorative tree plant',
  buxus:               'Buxus topiary',
  aquatic:             'Water plant',
  rhododendrons:       'Rhododendron azalea',
  carnivorous:         'Carnivorous plant',
  bedding:             'Bedding plant',
  viola:               'Viola pansy',
  herbs:               'Herb plant',
  lavender_plant:      'Lavender plant',
  roses_outdoor:       'Rose outdoor plant',
  heather:             'Calluna Erica heather',
  cacti:               'Cactus plant',
  ferns:               'Fern plant',
  zamioculcas:         'Zamioculcas ZZ plant',
  green:               'Green houseplant',
  cyclamen:            'Cyclamen plant',
  poinsettia:          'Poinsettia plant',
  conifers:            'Conifer plant',
  // срезка
  roses:               'Rose cut flower',
  chrysanthemums:      'Chrysanthemum cut flower',
  tulips:              'Tulip flower',
  lilies:              'Lily cut flower',
  gerbera:             'Gerbera flower',
  peonies:             'Peony flower',
  hydrangeas:          'Hydrangea cut flower',
  lisianthus:          'Lisianthus eustoma flower',
  alstroemeria:        'Alstroemeria flower',
  carnations:          'Carnation flower',
  statice:             'Statice flower',
  gypsophila:          'Gypsophila baby breath',
  // аксессуары
  baskets:             'Decorative basket floral',
  vases:               'Decorative vase',
  lanterns:            'Decorative lantern',
  pots_accessories:    'Decorative flower pot',
  floristry_items:     'Floral accessories wholesale',
  compositions:        'Floral arrangement terrarium',
}

// Маппинг цветов на английские термины
const COLOR_EN = {
  white:       'white',
  cream:       'cream',
  yellow:      'yellow',
  orange:      'orange',
  peach:       'peach',
  coral:       'coral',
  red:         'red',
  burgundy:    'burgundy',
  pink:        'pink',
  light_pink:  'light pink',
  hot_pink:    'hot pink',
  lilac:       'lilac',
  lavender:    'lavender',
  purple:      'purple',
  blue:        'blue',
  navy:        'navy',
  green:       'green',
  lime:        'lime green',
  silver:      'silver',
  brown:       'brown',
  terracotta:  'terracotta',
  black:       'black',
  multicolor:  'multicolor',
  bicolor:     'bicolor',
}

function buildQuery(product) {
  const name = product.display_name || product.name

  // Если display_name — только цифры, используем подкатегорию
  const isNumericName = /^\d+$/.test(name)

  // Цвет на английском
  const colorEn = product.colors?.[0] ? (COLOR_EN[product.colors[0]] ?? '') : ''

  if (!isNumericName) {
    // Убираем технические параметры: Ø12, H35, 140см и т.п.
    const cleanName = name
      .replace(/Ø\s*\d+(\.\d+)?/gi, '')
      .replace(/\bH\d+\b/gi, '')
      .replace(/\d+\s*см/gi, '')
      .replace(/\s+/g, ' ')
      .trim()

    // Если название на кириллице — добавляем английский термин из маппинга
    const hasCyrillic = /[а-яёА-ЯЁ]/.test(cleanName)
    const subcatEn = SUBCAT_EN[product.subcategory] ?? ''

    if (hasCyrillic && subcatEn) {
      const parts = [subcatEn, colorEn].filter(Boolean)
      return `${parts.join(' ')} plant catalog photo`
    }

    // Латинское название — используем как есть
    const parts = [cleanName, colorEn].filter(Boolean)
    return `${parts.join(' ')} ${product.category === 'accessories' ? 'product photo' : 'plant catalog photo white background'}`
  }

  // Числовое — строим запрос из подкатегории + цвет
  const subcatEn = SUBCAT_EN[product.subcategory] ?? product.subcategory ?? 'plant'
  const parts = [subcatEn, colorEn].filter(Boolean)
  return `${parts.join(' ')} catalog photo`
}

async function searchImages(query, n = IMAGES_PER_PRODUCT) {
  const url = new URL('https://www.googleapis.com/customsearch/v1')
  url.searchParams.set('key', GOOGLE_API_KEY)
  url.searchParams.set('cx', GOOGLE_CX)
  url.searchParams.set('q', query)
  url.searchParams.set('searchType', 'image')
  url.searchParams.set('num', String(Math.min(n, 10)))
  url.searchParams.set('imgSize', 'large')
  url.searchParams.set('safe', 'active')
  url.searchParams.set('imgType', 'photo')

  const res = await fetch(url.toString())
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message ?? `HTTP ${res.status}`)
  }
  const data = await res.json()
  return (data.items ?? []).map((item) => item.link).filter(Boolean)
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ── Основной импорт ───────────────────────────────────────────────────────────

let dbQuery = supabase
  .from('products')
  .select('id, name, display_name, category, subcategory, colors')
  .is('extra_images', null)
  .eq('is_active', true)
  .order('id')

if (CATEGORY !== 'ALL')    dbQuery = dbQuery.eq('category', CATEGORY)
if (SUBCATEGORY !== 'ALL') dbQuery = dbQuery.eq('subcategory', SUBCATEGORY)

const { data: products, error: fetchError } = await dbQuery

if (fetchError) {
  console.error('❌ Ошибка загрузки товаров:', fetchError.message)
  process.exit(1)
}

console.log(`\n[fetch-product-photos] Категория: ${CATEGORY}, Подкатегория: ${SUBCATEGORY}`)
console.log(`Товаров без фото: ${products.length}\n`)

if (products.length === 0) {
  console.log('Все товары уже имеют extra_images.')
  process.exit(0)
}

// Оценка расхода квоты
console.log(`⚠️  Будет использовано ~${products.length} запросов из 100 бесплатных/день\n`)

let saved = 0, skipped = 0, errors = 0

for (const product of products) {
  const query = buildQuery(product)
  const displayName = product.display_name || product.name

  process.stdout.write(`[${product.id}] ${displayName.slice(0, 40).padEnd(40)} → `)

  try {
    const images = await searchImages(query)

    if (images.length === 0) {
      process.stdout.write(`нет результатов (запрос: "${query}")\n`)
      skipped++
    } else {
      const { error: updateError } = await supabase
        .from('products')
        .update({ extra_images: images })
        .eq('id', product.id)

      if (updateError) {
        process.stdout.write(`❌ DB error: ${updateError.message}\n`)
        errors++
      } else {
        process.stdout.write(`✓ ${images.length} фото сохранено\n`)
        saved++
      }
    }
  } catch (err) {
    process.stdout.write(`❌ ${err.message}\n`)
    errors++
    // Останавливаемся при ошибке квоты
    if (err.message.includes('quota') || err.message.includes('429')) {
      console.log('\n⛔ Достигнут лимит API. Остановка.')
      break
    }
  }

  await sleep(DELAY_MS)
}

console.log(`\nГотово: ✓ ${saved} сохранено, ⟳ ${skipped} пропущено, ❌ ${errors} ошибок`)

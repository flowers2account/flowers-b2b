// fetch-product-photos.mjs
// Ищет фото товаров через Serper.dev (Google Images) и сохраняет в products.extra_images
//
// Запуск:
//   node --env-file=.env.local scripts/fetch-product-photos.mjs [category] [subcategory] [limit]
//
// Примеры:
//   node --env-file=.env.local scripts/fetch-product-photos.mjs pot anthuriums 1   ← тест 1 шт
//   node --env-file=.env.local scripts/fetch-product-photos.mjs pot anthuriums
//   node --env-file=.env.local scripts/fetch-product-photos.mjs cut roses
//   node --env-file=.env.local scripts/fetch-product-photos.mjs pot ALL

import { createClient } from '@supabase/supabase-js'

const CATEGORY        = process.argv[2] || 'ALL'
const SUBCATEGORY     = process.argv[3] || 'ALL'
const LIMIT           = process.argv[4] ? Number(process.argv[4]) : Infinity
const DELAY_MS        = 800
const IMAGES_PER_PRODUCT = 3
const MIN_SIZE        = 450  // минимум px по каждой стороне

const SERPER_API_KEY  = process.env.SERPER_API_KEY

if (!SERPER_API_KEY) {
  console.error('❌ Не задан SERPER_API_KEY в .env.local')
  process.exit(1)
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

// ── Домены ────────────────────────────────────────────────────────────────────

// Приоритетные: профессиональные поставщики, питомники и селекционеры
const DOMAIN_PRIORITY = new Set([
  // Поставщики пользователя
  'ozexport.nl', 'waterdrinker.nl',
  // Цветочные аукционы и маркетплейсы
  'royalfloraholland.com', 'floraccess.com', 'fleura.com',
  // Голландские оптовики
  'hamifleurs.nl', 'decorumplantsflowers.com', 'marginpar.com',
  // Специализированные питомники
  'anthura.nl', 'schreurs.nl', 'kwekerijvandervelden.nl',
  'koppebegonia.nl', 'labeau.nu', 'bromelia-specialist.nl',
  // Крупные онлайн-магазины растений
  'plantsome.nl', 'patchplants.com', 'bakker.com', 'green-bubble.com',
  // Селекционеры
  'dummenorange.com', 'syngentaflowers.com',
  // Профессиональные садоводческие организации
  'rhs.org.uk',
])

// Исключённые: соцсети, любительские фото, сайты с вотермарками
const DOMAIN_BLACKLIST = new Set([
  'pinterest.com', 'pinterest.ru', 'pinterest.nl', 'pinterest.fr',
  'pinterest.de', 'pinterest.co.uk', 'pinterest.es', 'pinterest.it',
  'instagram.com', 'flickr.com', 'reddit.com',
  'amazon.com', 'amazon.nl', 'amazon.de', 'amazon.co.uk',
  'etsy.com', 'ebay.com', 'alibaba.com', 'aliexpress.com',
  'wikimedia.org', 'shutterstock.com', 'istockphoto.com',
  'dreamstime.com', 'depositphotos.com', 'gettyimages.com',
  'alamy.com', 'stock.adobe.com',
])

function getDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, '') }
  catch { return '' }
}

function scoreImage(item) {
  const domain = getDomain(item.imageUrl ?? '')
  if (DOMAIN_BLACKLIST.has(domain)) return -1

  // Проверяем также по части домена (например, nl.pinterest.com)
  if ([...DOMAIN_BLACKLIST].some(d => domain.endsWith(d))) return -1

  let score = 0
  if (DOMAIN_PRIORITY.has(domain)) score += 50

  const w = item.imageWidth  || 0
  const h = item.imageHeight || 0
  if (w < MIN_SIZE || h < MIN_SIZE) return -1

  if (w >= 800  && h >= 800)  score += 20
  if (w >= 1200 && h >= 1200) score += 10

  // Предпочитаем пропорции от квадрата до 4:3
  const ratio = w / (h || 1)
  if (ratio >= 0.7 && ratio <= 1.6) score += 15

  return score
}

// ── Маппинг подкатегорий ──────────────────────────────────────────────────────

const SUBCAT_EN = {
  anthuriums:        'Anthurium',
  orchids:           'Phalaenopsis orchid',
  kalanchoe:         'Kalanchoe',
  spathiphyllum:     'Spathiphyllum peace lily',
  hydrangeas_indoor: 'Hydrangea indoor',
  bromeliads:        'Bromeliad',
  begonias:          'Begonia',
  roses_indoor:      'Rose indoor pot',
  dracaena:          'Dracaena',
  hedera:            'Hedera ivy',
  palms:             'Palm plant',
  calathea:          'Calathea',
  large_leaved:      'Large leaf tropical plant',
  polyscias:         'Polyscias',
  flowering:         'Flowering houseplant',
  succulents:        'Succulent',
  bulbs_indoor:      'Bulb plant indoor',
  helleborus:        'Helleborus',
  climbing_plants:   'Climbing plant',
  ficus:             'Ficus',
  chrysanthemums_pot:'Chrysanthemum pot',
  trees:             'Decorative tree',
  buxus:             'Buxus topiary',
  aquatic:           'Water plant',
  rhododendrons:     'Rhododendron azalea',
  cacti:             'Cactus',
  ferns:             'Fern',
  zamioculcas:       'Zamioculcas ZZ plant',
  green:             'Green houseplant',
  cyclamen:          'Cyclamen',
  poinsettia:        'Poinsettia',
  conifers:          'Conifer',
  azalea_indoor:     'Azalea indoor',
  lavender_plant:    'Lavender plant',
  roses_outdoor:     'Rose outdoor',
  heather:           'Calluna Erica heather',
  // срезка
  roses:             'Rose cut flower',
  chrysanthemums:    'Chrysanthemum cut flower',
  tulips:            'Tulip',
  lilies:            'Lily cut flower',
  gerbera:           'Gerbera',
  peonies:           'Peony',
  hydrangeas:        'Hydrangea cut flower',
  lisianthus:        'Lisianthus eustoma',
  alstroemeria:      'Alstroemeria',
  carnations:        'Carnation',
  gypsophila:        'Gypsophila baby breath',
  // аксессуары
  baskets:           'Decorative floral basket',
  vases:             'Decorative vase',
  lanterns:          'Decorative lantern',
  pots_accessories:  'Decorative flower pot',
  floristry_items:   'Floral accessories',
  compositions:      'Floral arrangement',
}

const COLOR_EN = {
  white: 'white', cream: 'cream', yellow: 'yellow', orange: 'orange',
  peach: 'peach', coral: 'coral', red: 'red', burgundy: 'burgundy',
  pink: 'pink', light_pink: 'light pink', hot_pink: 'hot pink',
  lilac: 'lilac', lavender: 'lavender', purple: 'purple',
  blue: 'blue', green: 'green', multicolor: 'multicolor',
}

// ── Построение поискового запроса ─────────────────────────────────────────────

function buildQuery(product) {
  const name    = product.display_name || product.name
  const subcatEn = SUBCAT_EN[product.subcategory] ?? 'plant'
  const colorEn  = product.colors?.[0] ? (COLOR_EN[product.colors[0]] ?? '') : ''

  // Извлекаем сорт из «Название» — основной источник точных запросов
  const cultivarMatch = name.match(/«([^»]+)»/)
  const cultivar = cultivarMatch ? cultivarMatch[1] : null

  // Получаем латинский род из subcatEn (первое слово: "Phalaenopsis orchid" → "Phalaenopsis")
  const genus = subcatEn.split(' ')[0]

  if (cultivar) {
    // Именованный сорт: "Anthurium Karma White" — Google понимает русскую транслитерацию
    return `${genus} ${cultivar} plant`
  }

  // Без сорта — латинское название + цвет
  const hasCyrillic = /[а-яёА-ЯЁ]/.test(name)
  if (hasCyrillic) {
    return [subcatEn, colorEn, 'plant wholesale photo'].filter(Boolean).join(' ')
  }

  // Латинское display_name (OZ и др.) — используем как есть, убираем размеры
  const cleanName = name
    .replace(/Ø\s*\d+(\.\d+)?/gi, '')
    .replace(/\bH\d+\b/gi, '')
    .replace(/\d+\s*cm\b/gi, '')
    .replace(/\s+/g, ' ').trim()

  return `${cleanName} ${colorEn} plant photo`.trim()
}

// ── Поиск через Serper ────────────────────────────────────────────────────────

async function searchImages(query) {
  const res = await fetch('https://google.serper.dev/images', {
    method: 'POST',
    headers: { 'X-API-KEY': SERPER_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: query, num: 10 }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message ?? `HTTP ${res.status}`)
  }
  const data = await res.json()
  return data.images ?? []
}

function pickBest(items, n) {
  return items
    .map(item => ({ item, score: scoreImage(item) }))
    .filter(x => x.score >= 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map(x => x.item.imageUrl)
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// ── Основной цикл ─────────────────────────────────────────────────────────────

let dbQuery = supabase
  .from('products')
  .select('id, name, display_name, category, subcategory, colors')
  .is('extra_images', null)
  .eq('is_active', true)
  .order('id')

if (CATEGORY   !== 'ALL') dbQuery = dbQuery.eq('category',   CATEGORY)
if (SUBCATEGORY !== 'ALL') dbQuery = dbQuery.eq('subcategory', SUBCATEGORY)

const { data: products, error: fetchError } = await dbQuery
if (fetchError) { console.error('❌', fetchError.message); process.exit(1) }

const limited = products.slice(0, LIMIT)
console.log(`\n[fetch-product-photos] ${CATEGORY} / ${SUBCATEGORY}`)
console.log(`Товаров без фото: ${products.length}, обработаем: ${limited.length}\n`)

if (limited.length === 0) { console.log('Все уже имеют extra_images.'); process.exit(0) }

let saved = 0, skipped = 0, errors = 0

for (const product of limited) {
  const query = buildQuery(product)
  const label = (product.display_name || product.name).slice(0, 42).padEnd(42)
  process.stdout.write(`[${product.id}] ${label} → `)

  try {
    const items  = await searchImages(query)
    const images = pickBest(items, IMAGES_PER_PRODUCT)

    if (images.length === 0) {
      process.stdout.write(`нет подходящих (запрос: "${query}")\n`)
      skipped++
    } else {
      const { error: updateError } = await supabase
        .from('products').update({ extra_images: images }).eq('id', product.id)

      if (updateError) {
        process.stdout.write(`❌ ${updateError.message}\n`); errors++
      } else {
        process.stdout.write(`✓ ${images.length} фото [${getDomain(images[0])}]\n`)
        saved++
      }
    }
  } catch (err) {
    process.stdout.write(`❌ ${err.message}\n`); errors++
    if (err.message.includes('quota') || err.message.includes('429')) {
      console.log('\n⛔ Лимит API. Остановка.'); break
    }
  }

  await sleep(DELAY_MS)
}

console.log(`\nГотово: ✓ ${saved} сохранено, ⟳ ${skipped} пропущено, ❌ ${errors} ошибок`)

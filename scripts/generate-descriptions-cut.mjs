// generate-descriptions-cut.mjs
// Генерирует short_description, description, florist_usage, seo_keywords, highlights
// для срезанных цветов через Gemini
//
// Запуск:
//   node --env-file=.env.local scripts/generate-descriptions-cut.mjs [subcategory] [limit]
//
// Примеры:
//   node --env-file=.env.local scripts/generate-descriptions-cut.mjs chrysanthemums 1   ← тест
//   node --env-file=.env.local scripts/generate-descriptions-cut.mjs chrysanthemums
//   node --env-file=.env.local scripts/generate-descriptions-cut.mjs roses
//   node --env-file=.env.local scripts/generate-descriptions-cut.mjs ALL

import { createClient } from '@supabase/supabase-js'

const SUBCATEGORY  = process.argv[2] || 'ALL'
const LIMIT        = process.argv[3] ? Number(process.argv[3]) : Infinity
const DELAY_MS     = 1800
const GEMINI_MODEL = 'gemini-flash-lite-latest'

const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY
if (!GEMINI_API_KEY) {
  console.error('❌ Не задан GOOGLE_GEMINI_API_KEY в .env.local')
  process.exit(1)
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

// ── Маппинги ──────────────────────────────────────────────────────────────────

const COUNTRY_RU = {
  NL: 'Нидерланды', EC: 'Эквадор', KE: 'Кения', CN: 'Китай',
  CO: 'Колумбия', ET: 'Эфиопия', IL: 'Израиль', DK: 'Дания', RU: 'Россия',
}

const COLOR_RU = {
  white: 'белый', cream: 'кремовый', yellow: 'жёлтый', orange: 'оранжевый',
  peach: 'персиковый', coral: 'коралловый', red: 'красный', burgundy: 'бордовый',
  pink: 'розовый', light_pink: 'светло-розовый', hot_pink: 'ярко-розовый',
  lilac: 'сиреневый', lavender: 'лавандовый', purple: 'фиолетовый',
  blue: 'синий', green: 'зелёный', multicolor: 'микс', bicolor: 'двухцветный',
}

const VARIETY_TYPE_RU = {
  single:  'одноголовая',
  spray:   'кустовая',
  pompom:  'помпонная',
  disbud:  'одноголовая premium',
  santini: 'сантини',
}

const SUBCAT_RU = {
  roses:          'розы',
  chrysanthemums: 'хризантемы',
  tulips:         'тюльпаны',
  lilies:         'лилии',
  gerbera:        'герберы',
  peonies:        'пионы',
  hydrangeas:     'гортензии',
  lisianthus:     'лизиантус / эустома',
  alstroemeria:   'альстромерии',
  carnations:     'гвоздики',
  gypsophila:     'гипсофила',
  ranunculus:     'ранункулюсы',
  anemones:       'анемоны',
  eustoma:        'эустома',
  freesia:        'фрезия',
  statice:        'статица',
  hypericum:      'гиперикум',
  anthurium_cut:  'антуриум срезка',
  birds_of_paradise: 'стрелиция',
  proteas:        'протеи',
  ilex:           'илекс',
  mimosa:         'мимоза',
  amaryllis:      'амариллис / гиппеаструм',
  sunflower:      'подсолнух',
  snapdragon:     'антирринум / львиный зев',
  veronica:       'вероника',
  delphinium:     'дельфиниум',
  matthiola:      'маттиола',
  waxflower:      'хамелауциум',
  trachelium:     'трахелиум',
  allium:         'аллиум',
  solidago:       'солидаго',
  seasonal:       'сезонные цветы',
  exotic:         'экзотика',
}

// ── Построение промпта ────────────────────────────────────────────────────────

function buildInput(p) {
  const obj = {
    название:        p.display_name || p.name,
    подкатегория:    SUBCAT_RU[p.subcategory] || p.subcategory,
    ...(p.variety_type  && { тип_формы:     VARIETY_TYPE_RU[p.variety_type] || p.variety_type }),
    ...(p.length_cm     && { длина_см:       p.length_cm }),
    ...(p.colors?.length && { цвет:          p.colors.map(c => COLOR_RU[c] || c).join(', ') }),
    ...(p.country_iso   && { страна:         COUNTRY_RU[p.country_iso] || p.country_iso }),
    ...(p.farm          && { ферма:          p.farm }),
    ...(p.stems_per_pack && { стеблей_в_пачке: p.stems_per_pack }),
    ...(p.weight_gram   && { вес_пачки_г:    p.weight_gram }),
    ...(p.quality_grade && { класс_качества: p.quality_grade }),
  }
  return JSON.stringify(obj, null, 2)
}

function buildPrompt(p) {
  const input = buildInput(p)

  return `Ты — AI-копирайтер для B2B flower marketplace. Пишешь только на русском языке.

## Данные товара
${input}

## Задача
Сгенерируй описание срезанного цветка для страницы товара оптового B2B каталога.

## Правила
- Тон: Premium B2B ecommerce — профессиональный, лаконичный, без восклицательных знаков
- Без воды, без SEO-спама
- НЕ выдумывай свойства, которых нет в данных (не придумывай сорт, аромат, длину стебля и т.д.)
- НЕ пиши "нежный", "роскошный", "изысканный" — только факты и конкретика
- НЕ пиши про символику цветов, языки цветов, подарочные смыслы
- Если тип формы "кустовая" — акцентируй ветвистость и объём; если "одноголовая" — крупный бутон
- Если "помпонная" — упомяни плотное шаровидное соцветие
- short_description: 1–2 предложения — главные коммерческие характеристики (тип, цвет, длина, страна/ферма если есть)
- description: 1–2 абзаца — для кого подходит, в каких флористических работах используется
- florist_usage: конкретные применения — монобукеты, свадебная флористика, корпоративные заказы и т.д.
- seo_keywords: 5–8 поисковых запросов (русский, как ищут оптовики)
- highlights: 4–5 фактических пунктов о ключевых коммерческих свойствах

## Формат ответа
Верни ТОЛЬКО валидный JSON без markdown-блоков:
{
  "short_description": "1-2 предложения",
  "description": "1-2 абзаца",
  "florist_usage": ["монобукеты", "свадебная флористика"],
  "seo_keywords": ["хризантема кустовая оптом", "белая хризантема срезка"],
  "highlights": ["Длина 70 см", "Кустовая форма", "Нидерланды"]
}`
}

// ── Вызов Gemini ──────────────────────────────────────────────────────────────

async function generate(product) {
  const prompt = buildPrompt(product)

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, responseMimeType: 'application/json' },
      }),
    }
  )

  if (!resp.ok) throw new Error(`Gemini ${resp.status}: ${await resp.text()}`)

  const data = await resp.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Пустой ответ от Gemini')

  const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
  try {
    return JSON.parse(clean)
  } catch {
    throw new Error(`JSON parse error. Raw: ${clean.slice(0, 200)}`)
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// ── Основной цикл ─────────────────────────────────────────────────────────────

let dbQuery = supabase
  .from('products')
  .select(`id, name, display_name, subcategory, variety_type,
           length_cm, colors, country_iso, farm,
           stems_per_pack, weight_gram, quality_grade`)
  .eq('category', 'cut')
  .is('short_description', null)
  .eq('is_active', true)
  .order('id')

if (SUBCATEGORY !== 'ALL') dbQuery = dbQuery.eq('subcategory', SUBCATEGORY)

const { data: products, error: fetchError } = await dbQuery
if (fetchError) { console.error('❌', fetchError.message); process.exit(1) }

const limited = products.slice(0, LIMIT)
console.log(`\n[generate-descriptions-cut] подкатегория: ${SUBCATEGORY}`)
console.log(`Товаров без описания: ${products.length}, обработаем: ${limited.length}\n`)

if (limited.length === 0) { console.log('Все уже имеют описание.'); process.exit(0) }

let saved = 0, errors = 0

for (const product of limited) {
  const label = (product.display_name || product.name).slice(0, 44).padEnd(44)
  process.stdout.write(`[${product.id}] ${label} → `)

  try {
    const { short_description, description, florist_usage, seo_keywords, highlights } = await generate(product)

    const { error: updateError } = await supabase
      .from('products')
      .update({ short_description, description, florist_usage, seo_keywords, highlights })
      .eq('id', product.id)

    if (updateError) {
      process.stdout.write(`❌ DB: ${updateError.message}\n`); errors++
    } else {
      process.stdout.write(`✓\n`); saved++
    }
  } catch (err) {
    process.stdout.write(`❌ ${err.message.slice(0, 80)}\n`); errors++
  }

  await sleep(DELAY_MS)
}

console.log(`\nГотово: ✓ ${saved} сохранено, ❌ ${errors} ошибок`)

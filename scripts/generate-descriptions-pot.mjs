// generate-descriptions-pot.mjs
// Генерирует description, care_instructions, highlights для горшечных растений через Gemini
//
// Запуск:
//   node --env-file=.env.local scripts/generate-descriptions-pot.mjs [subcategory] [limit]
//
// Примеры:
//   node --env-file=.env.local scripts/generate-descriptions-pot.mjs anthuriums 1   ← тест
//   node --env-file=.env.local scripts/generate-descriptions-pot.mjs anthuriums
//   node --env-file=.env.local scripts/generate-descriptions-pot.mjs orchids
//   node --env-file=.env.local scripts/generate-descriptions-pot.mjs ALL

import { createClient } from '@supabase/supabase-js'

const SUBCATEGORY = process.argv[2] || 'ALL'
const LIMIT       = process.argv[3] ? Number(process.argv[3]) : Infinity
const DELAY_MS    = 1800
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

const POT_COLOR_RU = {
  wit: 'белый', zwart: 'чёрный', rood: 'красный', groen: 'зелёный',
  geel: 'жёлтый', oranje: 'оранжевый', roze: 'розовый', paars: 'фиолетовый',
  blauw: 'синий', bruin: 'коричневый', zilver: 'серебряный', grijs: 'серый',
  antraciet: 'антрацит', terracotta: 'терракотовый', beige: 'бежевый',
  creme: 'кремовый', naturel: 'натуральный', transparant: 'прозрачный',
  bordeaux: 'бордовый', lichtgrijs: 'светло-серый', taupe: 'тауп',
}

const POT_MATERIAL_RU = {
  plastic: 'пластик', kunststof: 'пластик', terracotta: 'терракота',
  keramiek: 'керамика', 'keramiek gedecoreerd': 'декоративная керамика',
  metaal: 'металл', bamboe: 'бамбук', riet: 'ротанг', jute: 'джут',
  hout: 'дерево', kokosvezel: 'кокосовое волокно', klei: 'глина',
  'gerecyclede pot': 'переработанный пластик', gerecycleerd: 'переработанный пластик',
}

const POT_FORM_RU = {
  sierpot: 'декоративный горшок', bloempot: 'стандартный горшок',
  kweekpot: 'технический горшок', hangpot: 'кашпо для подвески',
  baliesbak: 'ящик', schaal: 'чаша',
}

const SUBSTRATE_RU = {
  potgrond: 'торфяной грунт', '100% veen vrij': 'субстрат без торфа',
  '70% veen vrij': 'субстрат 70% без торфа', '50% veen vrij': 'экологичный субстрат',
  hydro: 'гидрогрунт', kokos: 'кокосовый субстрат', lava: 'лавовый грунт',
}

const SUBCAT_RU = {
  anthuriums: 'антуриумы', orchids: 'орхидеи', kalanchoe: 'каланхоэ',
  spathiphyllum: 'спатифиллум', hydrangeas_indoor: 'гортензии комнатные',
  bromeliads: 'бромелии', begonias: 'бегонии', roses_indoor: 'розы комнатные',
  dracaena: 'драцена', hedera: 'хедера / плющ', palms: 'пальмы',
  calathea: 'калатея', large_leaved: 'крупнолистные', polyscias: 'полисциас / пахира',
  flowering: 'цветущие комнатные', succulents: 'суккуленты', bulbs_indoor: 'луковичные',
  helleborus: 'геллеборус', climbing_plants: 'вьющиеся', ficus: 'фикус',
  chrysanthemums_pot: 'хризантемы горшечные', trees: 'декоративные деревья',
  buxus: 'буксус / самшит', aquatic: 'водные растения', cacti: 'кактусы',
  ferns: 'папоротники', zamioculcas: 'замиокулькас', green: 'декоративно-лиственные',
  cyclamen: 'цикламен', poinsettia: 'пуансеттия', conifers: 'хвойные',
  azalea_indoor: 'азалея', lavender_plant: 'лаванда', roses_outdoor: 'розы садовые',
  heather: 'вереск', compositions: 'флористические композиции',
  pots_accessories: 'горшки и кашпо', baskets: 'корзины',
  vases: 'вазы', lanterns: 'фонари', floristry_items: 'предметы флористики',
}

// ── Построение промпта ────────────────────────────────────────────────────────

function buildInput(p) {
  const obj = {
    название:          p.display_name || p.name,
    подкатегория:      SUBCAT_RU[p.subcategory] || p.subcategory,
    ...(p.variant            && { вариант_форма:       p.variant }),
    ...(p.length_cm          && { высота_см:            p.length_cm }),
    ...(p.pot_diameter       && { диаметр_горшка_см:    p.pot_diameter }),
    ...(p.colors?.length     && { цвет_цветков:         p.colors.map(c => COLOR_RU[c] || c).join(', ') }),
    ...(p.pot_color          && { цвет_горшка:          POT_COLOR_RU[p.pot_color?.toLowerCase()] || p.pot_color }),
    ...(p.pot_material       && { материал_горшка:      POT_MATERIAL_RU[p.pot_material?.toLowerCase()] || p.pot_material }),
    ...(p.pot_form           && { тип_горшка:           POT_FORM_RU[p.pot_form?.toLowerCase()] || p.pot_form }),
    ...(p.substrate          && { субстрат:             SUBSTRATE_RU[p.substrate?.toLowerCase()] || p.substrate }),
    ...(p.min_plants_per_pot && { растений_в_горшке:    p.min_plants_per_pot }),
    ...(p.min_flowers_per_pot && { цветков_в_горшке:   p.min_flowers_per_pot }),
    ...(p.quality_grade      && { класс_качества:       p.quality_grade }),
    ...(p.country_iso        && { страна:               COUNTRY_RU[p.country_iso] || p.country_iso }),
    ...(p.farm               && { поставщик:            p.farm }),
  }
  return JSON.stringify(obj, null, 2)
}

function buildPrompt(p) {
  const input = buildInput(p)

  return `Ты — AI-копирайтер для B2B flower marketplace. Пишешь только на русском языке.

## Данные товара
${input}

## Задача
Сгенерируй описание горшечного растения для страницы товара.

## Правила
- Premium B2B ecommerce tone, дружелюбный и профессиональный
- Без воды, без SEO-спама, без восклицательных знаков
- НЕ выдумывай свойства которых нет в данных
- НЕ пиши про лечебные свойства или очищение воздуха
- НЕ пиши "неприхотливое" если нет оснований
- Длина description: 2–3 абзаца
- Если есть форма (пирамида, шпалера, ампель) — упоминай как готовое декоративное решение
- Если цветущее — описывай цветение, декоративность, сезон
- Если есть цвет / материал горшка — аккуратно интегрируй в текст
- В care_instructions: освещение, полив, температура, доп. уход — каждый с новой строки через \\n

## Формат ответа
Верни ТОЛЬКО валидный JSON без markdown-блоков:
{
  "description": "текст 2-3 абзаца",
  "care_instructions": "Освещение: ...\\nПолив: ...\\nТемпература: ...\\nУход: ...",
  "highlights": ["4-5 коротких пунктов о ключевых свойствах"]
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

  const data  = await resp.json()
  const text  = data.candidates?.[0]?.content?.parts?.[0]?.text
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
  .select(`id, name, display_name, subcategory, variant,
           length_cm, pot_diameter, colors, pot_color, pot_material, pot_form,
           substrate, min_plants_per_pot, min_flowers_per_pot, quality_grade,
           country_iso, farm`)
  .eq('category', 'pot')
  .is('description', null)
  .eq('is_active', true)
  .order('id')

if (SUBCATEGORY !== 'ALL') dbQuery = dbQuery.eq('subcategory', SUBCATEGORY)

const { data: products, error: fetchError } = await dbQuery
if (fetchError) { console.error('❌', fetchError.message); process.exit(1) }

const limited = products.slice(0, LIMIT)
console.log(`\n[generate-descriptions-pot] подкатегория: ${SUBCATEGORY}`)
console.log(`Товаров без описания: ${products.length}, обработаем: ${limited.length}\n`)

if (limited.length === 0) { console.log('Все уже имеют описание.'); process.exit(0) }

let saved = 0, errors = 0

for (const product of limited) {
  const label = (product.display_name || product.name).slice(0, 44).padEnd(44)
  process.stdout.write(`[${product.id}] ${label} → `)

  try {
    const { description, care_instructions, highlights } = await generate(product)

    const { error: updateError } = await supabase
      .from('products')
      .update({ description, care_instructions, highlights })
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

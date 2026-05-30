// translate-display-names-oz.mjs
// Переводит display_name для OZ-импортированных товаров через Gemini
// (тот же промпт, что у AI-переводчика накладных)
//
// Запуск:
//   node --env-file=.env.local scripts/translate-display-names-oz.mjs [subcategory|ALL]
//
// Примеры:
//   node --env-file=.env.local scripts/translate-display-names-oz.mjs anthuriums
//   node --env-file=.env.local scripts/translate-display-names-oz.mjs ALL

import { createClient } from '@supabase/supabase-js'

const SUBCATEGORY   = process.argv[2] || 'ALL'
const GEMINI_MODEL  = 'gemini-flash-lite-latest'
const BATCH_SIZE    = 30

const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY
if (!GEMINI_API_KEY) {
  console.error('❌ Не задан GOOGLE_GEMINI_API_KEY в .env.local')
  process.exit(1)
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

// ── Промпт (тот же, что в /api/translations/batch) ────────────────────────────

function buildPrompt(products) {
  return `Ты профессиональный floral catalog normalizer для русскоязычного цветочного каталога.

Твоя задача:
- расшифровывать florist abbreviations
- переводить botanical terms на русский
- транслитерировать сорта на кириллицу
- нормализовать коммерческие названия цветов
- приводить всё к единому catalog style

ПРАВИЛА:

1. Переводить botanical/common terms:
Chr / Chrys → Хризантема
Rosa / Rose → Роза
Carn → Гвоздика
Lis / Lisianthus → Эустома
Hydr → Гортензия
Paeonia / Pae → Пион
Lilium / Lil → Лилия
Gyps → Гипсофила
Helianthus → Подсолнух
Delphinium → Дельфиниум
Matricaria → Матрикария
Chamelaucium → Хамелациум
Cymbidium → Цимбидиум
Alstroemeria / Alstro → Альстромерия
Anthurium → Антуриум
Antirrhinum → Антирринум (Львиный зев)
Aster → Астра
Astilbe → Астильба
Ozothamnus → Озотхамнус
Leaf eucalyptus → Эвкалипт
Leaf leather fern → Ледерфёрн

2. Нормализовать florist forms:
T / Spray / Spr / sp → ветковая
bl / Disb → одноголовая
sa / Santini → сантини
dbl / do → махровая
or → восточная
fl → крупноцветковая

3. Сорта:
- НЕ переводить по смыслу
- транслитерировать кириллицей
- каждое слово с заглавной буквы
- ВСЕГДА оборачивать в русские ёлочки «»
- Числа в названии (132, 183, 304...) — это обозначение сорта/размера, оставлять как есть

4. Формат результата: [Вид] [форма если есть] «Сорт»
Примеры:
Anthurium 132 → Антуриум «132»
Anthurium caldonia → Антуриум «Калдония»
Anthurium mix in box → Антуриум «Микс Ин Бокс»
Anthurium love black → Антуриум «Лав Блэк»
Anthurium grand slam → Антуриум «Гранд Слэм»
Alstro dancing queen → Альстромерия «Дансинг Куин»
Chr T Baltica White → Хризантема ветковая «Балтика Вайт»
Chrys bl Superbowl → Хризантема одноголовая «Супербол»

5. Технический мусор (высота в см, коды партий, имена ферм) — игнорировать.

6. Не добавлять комментариев. Только готовое название.

ПЕРЕВЕДИ (верни ТОЛЬКО JSON массив):
${JSON.stringify(products)}

Формат ответа (БЕЗ markdown):
[
  {
    "original": "точная исходная строка",
    "translated": "русский перевод",
    "confidence": 0.9
  }
]`
}

// ── Вызов Gemini ──────────────────────────────────────────────────────────────

async function translateBatch(names) {
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(names) }] }],
        generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
      }),
    }
  )

  if (!resp.ok) throw new Error(`Gemini ${resp.status}: ${await resp.text()}`)

  const data = await resp.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Пустой ответ от Gemini')

  const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
  return JSON.parse(clean)
}

// ── Основной цикл ─────────────────────────────────────────────────────────────

let dbQuery = supabase
  .from('products')
  .select('id, name, display_name, subcategory')
  .eq('source', 'oz_export')
  .eq('is_active', true)
  // только те, у кого display_name содержит латиницу (ещё не переведены)
  .filter('display_name', 'ilike', '%a%')  // грубый фильтр, уточним ниже
  .order('subcategory', { ascending: true })
  .order('id', { ascending: true })

if (SUBCATEGORY !== 'ALL') dbQuery = dbQuery.eq('subcategory', SUBCATEGORY)

const { data: products, error: fetchError } = await dbQuery
if (fetchError) { console.error('❌', fetchError.message); process.exit(1) }

// Фильтруем только те, где display_name содержит латиницу
const untranslated = products.filter(p => /[a-zA-Z]/.test(p.display_name || p.name))

console.log(`\n[translate-display-names-oz] подкатегория: ${SUBCATEGORY}`)
console.log(`Товаров с английским display_name: ${untranslated.length}\n`)

if (untranslated.length === 0) { console.log('Все уже переведены.'); process.exit(0) }

let saved = 0, errors = 0

// Разбиваем на батчи
for (let i = 0; i < untranslated.length; i += BATCH_SIZE) {
  const batch = untranslated.slice(i, i + BATCH_SIZE)
  const names  = batch.map(p => p.display_name || p.name)

  console.log(`Батч ${Math.floor(i / BATCH_SIZE) + 1}: ${names.length} товаров...`)

  let translations
  try {
    translations = await translateBatch(names)
  } catch (err) {
    console.error(`❌ Gemini: ${err.message.slice(0, 120)}`)
    errors += batch.length
    continue
  }

  // Применяем переводы
  for (const item of batch) {
    const originalName = item.display_name || item.name
    const match = translations.find(t =>
      t.original?.trim().toLowerCase() === originalName.trim().toLowerCase()
    )

    const translated = match?.translated?.trim()

    if (!translated) {
      console.log(`  [${item.id}] ${originalName.padEnd(40)} → ⚠️ не найдено в ответе`)
      errors++
      continue
    }

    const { error } = await supabase
      .from('products')
      .update({ display_name: translated })
      .eq('id', item.id)

    if (error) {
      console.log(`  [${item.id}] ${originalName.padEnd(40)} → ❌ DB: ${error.message}`)
      errors++
    } else {
      console.log(`  [${item.id}] ${originalName.padEnd(40)} → ✓ ${translated}`)
      saved++
    }
  }
}

console.log(`\nГотово: ✓ ${saved} переведено, ❌ ${errors} ошибок`)

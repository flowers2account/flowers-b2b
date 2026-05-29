// translate-pot-names.mjs — переводит display_name горшечных через Gemini
// Запуск: node --env-file=.env.local scripts/translate-pot-names.mjs

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

const PRODUCTS = [
  // roses_indoor
  { id: 2387, name: "Hibiscus rosa sin.   ... 13" },
  { id: 2388, name: "Hibiscus rosa sin.   ...mix 17" },
  { id: 2389, name: "Hibiscus rosa sin. 'Sunny Bordeaux' 17" },
  { id: 2390, name: "Hibiscus rosa sin. 'Sunny'  ..mix 13" },
  { id: 2391, name: "Hibiscus rosa sin. 'Sunny'  ..mix 17" },
  { id: 2392, name: "Hibiscus rosa sinensis 'Bombay' 17" },
  { id: 2393, name: "Rosa   ... 6" },
  { id: 2394, name: "Rosa  'Beau Monde'   ...mix 11" },
  { id: 2395, name: "Rosa Absolut Kordana 11" },
  // hydrangeas_indoor
  { id: 2413, name: "Hydrangea mac.   ... 15" },
  { id: 2414, name: "Hydrangea mac.   ... 26" },
  { id: 2415, name: "Hydrangea mac.   ...mix 14" },
  { id: 2416, name: "Hydrangea mac.   ...mix 13" },
  { id: 2417, name: "Hydrangea mac. 'Adula' 23" },
  { id: 2418, name: "Hydrangea mac. 'Early Rosa' 14" },
  { id: 2419, name: "Hydrangea mac. 'Hi Fire' 14" },
  { id: 2420, name: "Hydrangea mac. 'Hi River' 13" },
  { id: 2421, name: "Hydrangea mac. 'Hi River' 23" },
  { id: 2422, name: "Hydrangea mac. 'Hovaria Hobella' 14" },
  { id: 2423, name: "Hydrangea mac. 'Hovaria Holibel' 14" },
  { id: 2424, name: "Hydrangea mac. 'Hovaria Ripple' 14" },
  { id: 2425, name: "Hydrangea mac. 'Ningbo' 13" },
  { id: 2426, name: "Hydrangea mac. 'Ningbo' 10" },
  { id: 2427, name: "Hydrangea mac. 'Schneeball' 11" },
  { id: 2428, name: "Hydrangea mac. 'Table Tensia' 23" },
  { id: 2429, name: "Hydrangea mac. 'Vuurwerk Rose' 14" },
  { id: 2430, name: "Hydrangea mac. 'Wudu' 15" },
  { id: 2431, name: "Hydrangea macrophylla Hi Ice 14" },
  { id: 2432, name: "Hydrangea macrophylla Hi Ocean 14" },
  { id: 2433, name: "Hydrangea macrophylla Hi White Sun 27" },
  { id: 2434, name: "Hydrangea macrophylla Hi White Sun 14" },
]

const prompt = `Ты профессиональный floral catalog normalizer для русскоязычного цветочного каталога горшечных растений.

ЗАДАЧА: переводи/транслитерируй название горшечного растения в каталожный формат на русском.

ПРАВИЛА ПЕРЕВОДА РОДА:
Hydrangea / Hydrangea mac. / Hydrangea macrophylla → Гортензия
Hibiscus rosa sinensis / Hibiscus rosa sin. → Гибискус
Rosa (горшечная) → Роза горшечная

ПРАВИЛА ДЛЯ СОРТА (часть в кавычках или после рода):
- НЕ переводить по смыслу — только транслитерация кириллицей
- Каждое слово с заглавной буквы
- Обернуть в русские ёлочки «»
- Примеры: Hi Fire → «Хай Фаер», Hi River → «Хай Ривер», Ningbo → «Нингбо», Schneeball → «Шнеебол», Hovaria Hobella → «Ховария Хобелла», Vuurwerk Rose → «Вурверк Роз», Adula → «Адула», Table Tensia → «Тейбл Тенсиа», Hi Ice → «Хай Айс», Hi Ocean → «Хай Оушен», Hi White Sun → «Хай Вайт Сан», Wudu → «Вуду», Early Rosa → «Эрли Роза», Beau Monde → «Бо Монд», Absolut Kordana → «Абсолют Кордана», Bombay → «Бомбей», Sunny Bordeaux → «Санни Бордо», Sunny → «Санни»

ПРАВИЛА ДЛЯ РАЗМЕРА ГОРШКА:
- Число в конце (10, 11, 13, 14, 15, 17, 23, 26...) = диаметр горшка, сохранять в конце
- Формат: "Гортензия «Сорт» 14"

ПРАВИЛА ДЛЯ МИКСА (... / ...mix / mix):
- "..." без сорта → просто "Гортензия 15" (без сорта)
- "...mix" → "Гортензия Микс 13"

ПРИМЕРЫ ОЖИДАЕМОГО РЕЗУЛЬТАТА:
"Hydrangea mac. 'Hi Fire' 14" → "Гортензия «Хай Фаер» 14"
"Hydrangea mac.   ...mix 13" → "Гортензия Микс 13"
"Hydrangea mac.   ... 26" → "Гортензия 26"
"Hibiscus rosa sin. 'Sunny Bordeaux' 17" → "Гибискус «Санни Бордо» 17"
"Hibiscus rosa sin.   ...mix 17" → "Гибискус Микс 17"
"Rosa   ... 6" → "Роза горшечная 6"
"Rosa  'Beau Monde'   ...mix 11" → "Роза горшечная «Бо Монд» Микс 11"

ПЕРЕВЕДИ (верни ТОЛЬКО JSON массив без markdown):
${JSON.stringify(PRODUCTS.map(p => p.name))}

Формат:
[{"original":"точная исходная строка","translated":"русский перевод","confidence":0.9}]`

async function run() {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY
  if (!apiKey) { console.error('GOOGLE_GEMINI_API_KEY не задан'); process.exit(1) }

  console.log(`Отправляю ${PRODUCTS.length} названий в Gemini...\n`)

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, responseMimeType: 'application/json' }
      })
    }
  )

  if (!response.ok) {
    console.error('Gemini HTTP error:', response.status, await response.text())
    process.exit(1)
  }

  const data = await response.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) { console.error('Пустой ответ Gemini'); process.exit(1) }

  const results = JSON.parse(text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim())

  console.log('=== Результаты переводов ===')
  const updates = []
  for (const res of results) {
    const product = PRODUCTS.find(p => p.name === res.original)
    if (!product) { console.warn('Не найден ID для:', res.original); continue }
    console.log(`[${product.id}] ${res.original}\n     → ${res.translated} (${res.confidence})`)
    updates.push({ id: product.id, display_name: res.translated })
  }

  console.log('\n=== Применяю обновления ===')
  let ok = 0, err = 0
  for (const u of updates) {
    const { error } = await supabase.from('products').update({ display_name: u.display_name }).eq('id', u.id)
    if (error) { console.error(`ERR id=${u.id}:`, error.message); err++ }
    else { process.stdout.write('.'); ok++ }
  }
  console.log(`\n\nГотово: ${ok} обновлено, ${err} ошибок`)
}

run()

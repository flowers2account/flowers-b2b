// Запуск: node --env-file=.env.local scripts/translate-accessories.mjs
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

const PROMPT_TEMPLATE = (items) => `Ты создаёшь русские названия для аксессуаров флористического интернет-магазина.

Вход: массив объектов {id, name, variant, subcategory}
Выход: массив {id, display_name} — краткое товарное название на русском.

ТИПЫ (из поля variant):
LANTERN → Фонарь
BASKET / BASK → Корзина
VASE → Ваза
TRAY → Поднос
POT / BAMBOO POT / CANX BAMB → Горшок
MUG → Кашпо

МАТЕРИАЛЫ:
IRON / METAL → металлический
BAMBOO → бамбуковый
JUTE → джутовый
GLASS → стеклянный
RATTAN → ротанговый
PAPER → бумажный
CANXE / CANE → плетёный (из ротанга)
PC → пластиковый

ЦВЕТА:
NATURAL → натуральный
GREEN → зелёный
GOLD → золотой
YELLOW → жёлтый
RED → красный
PURPLE → фиолетовый
GREY / GRAY / KUBU GREY → серый
WHITE → белый
BLACK → чёрный
PINK → розовый
BLUE → синий

ФОРМАТ display_name:
{Тип} {материал прилагательное} {цвет прилагательное} Ø{ширина} H{высота}
Если размеры есть только в числе в конце name (например "...H%25 16") — используй его как Ø16.
Если S/3 — указывай «(компл. 3 шт.)»
Для Dutch текста (per Stuk, hoogte и т.п.) — переводи смысл.
Для Kunstplant — «Искусственное растение высота {hoogte}см горшок {pot}см»

ПРИМЕРЫ:
variant "26CM LANTERN/BAMBOO/NATURAL/Ø23 H26" → "Фонарь бамбуковый натуральный Ø23 H26"
variant "19CM BASKET/PAPER/GREEN/Ø19 H16" → "Корзина бумажная зелёная Ø19 H16"
variant "13CM VASE/GLASS/PURPLE/Ø13 H12" → "Ваза стеклянная фиолетовая Ø13 H12"
variant "52CM TRAY/IRON/GOLD/S/3/Ø52 H25" → "Поднос металлический золотой Ø52 H25 (компл. 3 шт.)"
variant "20CM BAMBOO POT/CANXE/NATURAL/Ø20 H20" → "Горшок плетёный натуральный Ø20 H20"
variant "pot 24cm, hoogte 180" → "Искусственное растение высота 180см горшок 24см"
variant "per Stuk - Guirlande schelpen gemengd 25 cm naturel" → "Гирлянда из ракушек микс 25см натуральная"

ВЕРНИ ТОЛЬКО JSON без markdown:
${JSON.stringify(items)}

[{"id":...,"display_name":"..."}]`

async function callGemini(items, apiKey) {
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: PROMPT_TEMPLATE(items) }] }],
        generationConfig: { temperature: 0.1, responseMimeType: 'application/json' }
      })
    }
  )
  if (!resp.ok) throw new Error(`Gemini ${resp.status}: ${await resp.text()}`)
  const data = await resp.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Пустой ответ')
  return JSON.parse(text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim())
}

async function run() {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY
  if (!apiKey) { console.error('GOOGLE_GEMINI_API_KEY не задан'); process.exit(1) }

  const { data: products, error } = await supabase
    .from('products')
    .select('id, name, display_name, variant, subcategory')
    .eq('category', 'accessories')
    .order('subcategory').order('id')

  if (error) { console.error('DB error:', error.message); process.exit(1) }

  const untranslated = products.filter(p => p.display_name === p.name)
  console.log(`Всего аксессуаров: ${products.length}, нужно перевести: ${untranslated.length}\n`)
  if (untranslated.length === 0) { console.log('Все переведены!'); return }

  const BATCH = 60
  const batches = []
  for (let i = 0; i < untranslated.length; i += BATCH)
    batches.push(untranslated.slice(i, i + BATCH))

  let allUpdates = []
  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b]
    console.log(`Батч ${b + 1}/${batches.length}: ${batch.length} позиций...`)
    const input = batch.map(p => ({ id: p.id, name: p.name, variant: p.variant ?? '', subcategory: p.subcategory }))
    const results = await callGemini(input, apiKey)
    for (const r of results) {
      if (r.id && r.display_name) allUpdates.push({ id: r.id, display_name: r.display_name })
      else console.warn('Нет перевода:', JSON.stringify(r))
    }
    if (b < batches.length - 1) await new Promise(r => setTimeout(r, 2000))
  }

  console.log('\n=== Результат ===')
  allUpdates.forEach(u => {
    const orig = untranslated.find(p => p.id === u.id)
    console.log(`[${u.id}] ${orig?.variant ?? orig?.name}\n     → ${u.display_name}`)
  })

  console.log(`\n=== Обновляю ${allUpdates.length} записей ===`)
  let ok = 0, err = 0
  for (const u of allUpdates) {
    const { error } = await supabase.from('products').update({ display_name: u.display_name }).eq('id', u.id)
    if (error) { console.error(`ERR ${u.id}:`, error.message); err++ }
    else { process.stdout.write('.'); ok++ }
  }
  console.log(`\n\nГотово: ${ok} обновлено, ${err} ошибок`)
}

run()

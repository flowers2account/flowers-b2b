// fix-pot-guillemets.mjs — добавляет «» к сортам горшечных, транслитерирует Latin→Russian
// Запуск: node --env-file=.env.local scripts/fix-pot-guillemets.mjs

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

async function callGemini(items, apiKey) {
  const names = items.map(p => p.display_name)

  const prompt = `Ты нормализуешь названия горшечных растений для русскоязычного каталога цветочного магазина.

ЗАДАЧА: Для каждого названия:
1. Если есть сорт (культивар) — обернуть его в «» (русские ёлочки)
2. Если сорт на латинице — сначала транслитерировать, потом обернуть в «»
3. Слова-дескрипторы (Микс, Мини, Луковичная, Горшечная, Белый/Белая, Розовый/Розовая, Жёлтый, Оранжевый, Сиреневый, Красный) — НЕ оборачивать, оставить снаружи «»
4. Числа в конце (размер горшка: 7, 10, 12, 13, 14, 17, 19, 20, 24) — оставить снаружи «»

ТРАНСЛИТЕРАЦИЯ латинских сортов:
Alana → Алана, Bingo → Бинго, Cupido → Купидо, Chopin → Шопен, Diamond → Даймонд,
Pearl → Пёрл, Strauss → Штраус, Sweet → Свит, Chico → Чико, Ricardo → Рикардо,
Silvana → Силвана, Torelli → Торелли

ПРАВИЛО определения сорта:
- Сорт = слова после названия рода/типа растения
- Названия родов (НЕ оборачивать): Антуриум, Каланхоэ, Фаленопсис, Камбрия, Пафиопедилум,
  Гузмания, Тилландсия, Врисея, Ананас, Катопсис, Криптантус, Эхмея, Бегония, Элатиор,
  Зантедесхия, Крокосмия, Куркума, Оксалис, Хризантема, Цикламен, Спатифиллум,
  Гортензия, Гибискус, Роза, Бромелия

ПРИМЕРЫ:
"Антуриум Блэк Лав" → "Антуриум «Блэк Лав»"
"Антуриум Микс" → "Антуриум Микс"  (нет сорта)
"Антуриум Микс 4" → "Антуриум Микс 4"  (нет сорта)
"Каланхоэ Розбад Микс" → "Каланхоэ «Розбад» Микс"
"Каланхоэ Розбад Куин Барби" → "Каланхоэ «Розбад Куин Барби»"
"Каланхоэ РосДон Алано" → "Каланхоэ «РосДон Алано»"
"Фаленопсис Белый" → "Фаленопсис Белый"  (цветовой дескриптор, не сорт)
"Фаленопсис Инвернесс" → "Фаленопсис «Инвернесс»"
"Фаленопсис Мини Микс" → "Фаленопсис Мини Микс"
"Гузмания Калипсо" → "Гузмания «Калипсо»"
"Тилландсия Дольче" → "Тилландсия «Дольче»"
"Тилландсия" → "Тилландсия"  (нет сорта)
"Бегония Элатиор Пинк Риббон" → "Бегония Элатиор «Пинк Риббон»"
"Зантедесхия Капитан Брунелло" → "Зантедесхия «Капитан Брунелло»"
"Хризантема Горшечная Микс" → "Хризантема Горшечная Микс"
"Хризантема Джеллифиш Микс" → "Хризантема «Джеллифиш» Микс"
"Цикламен Аллюр" → "Цикламен «Аллюр»"
"Спатифиллум Alana 12" → "Спатифиллум «Алана» 12"
"Спатифиллум Sweet Chico 13" → "Спатифиллум «Свит Чико» 13"
"Гортензия «Хай Фаер» 14" → "Гортензия «Хай Фаер» 14"  (уже правильно, не трогать)

ВЕРНИ ТОЛЬКО JSON массив без markdown:
${JSON.stringify(names)}

Формат:
[{"original":"исходное название","updated":"исправленное название"}]`

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
    const err = await response.text()
    throw new Error(`Gemini HTTP ${response.status}: ${err}`)
  }

  const data = await response.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Пустой ответ Gemini')
  return JSON.parse(text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim())
}

async function run() {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY
  if (!apiKey) { console.error('GOOGLE_GEMINI_API_KEY не задан'); process.exit(1) }

  // Берём все горшечные БЕЗ «» (гортензии/гибискусы уже обновлены)
  const { data: products, error } = await supabase
    .from('products')
    .select('id, display_name, subcategory')
    .eq('category', 'pot')
    .eq('is_active', true)
    .not('display_name', 'ilike', '%«%')
    .order('subcategory')

  if (error) { console.error('DB error:', error.message); process.exit(1) }
  console.log(`Найдено ${products.length} позиций без «»\n`)

  // Разбиваем на батчи по 60
  const BATCH = 60
  const batches = []
  for (let i = 0; i < products.length; i += BATCH) {
    batches.push(products.slice(i, i + BATCH))
  }

  let allResults = []
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]
    console.log(`Батч ${i + 1}/${batches.length}: ${batch.length} позиций...`)
    const results = await callGemini(batch, apiKey)
    allResults = allResults.concat(results.map((r, idx) => ({
      id: batch[idx].id,
      original: r.original,
      updated: r.updated
    })))
    if (i < batches.length - 1) await new Promise(r => setTimeout(r, 2000))
  }

  // Показываем только изменения
  const changed = allResults.filter(r => r.original !== r.updated)
  console.log(`\n=== Изменений: ${changed.length} из ${allResults.length} ===`)
  changed.forEach(r => console.log(`  [${r.id}] ${r.original}\n       → ${r.updated}`))

  // Применяем
  console.log('\n=== Обновляю БД ===')
  let ok = 0, err = 0
  for (const r of changed) {
    const { error } = await supabase
      .from('products')
      .update({ display_name: r.updated })
      .eq('id', r.id)
    if (error) { console.error(`ERR id=${r.id}:`, error.message); err++ }
    else { process.stdout.write('.'); ok++ }
  }
  console.log(`\n\nГотово: ${ok} обновлено, ${err} ошибок`)
}

run()

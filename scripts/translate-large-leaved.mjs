// Запуск: node --env-file=.env.local scripts/translate-large-leaved.mjs
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

const PROMPT_TEMPLATE = (names) => `Ты нормализуешь названия горшечных растений для русскоязычного цветочного каталога.

РОДЫ → русское название:
Fatsia japonica → Фатсия Японская
Maranta leuc. (leuconeura) → Маранта Красножильчатая
Maranta leuconeura → Маранта Красножильчатая
Monstera → Монстера
Monstera delic. (deliciosa) → Монстера Деликатесная
Monstera obliqua → Монстера Косая
Monstera pertusum → Монстера Перфорированная
Philodendron → Филодендрон
Philodendron bipennifolium / bipinn. → Филодендрон Двуперистый
Philodendron scandens → Филодендрон Лазящий
Philodendron gloriosum → Филодендрон Глориозум
Philodendron melanochrysum → Филодендрон Меланохризум
Scindapsus → Сциндапсус
Scindapsus pictus → Сциндапсус Расписной

ПРАВИЛА для сорта:
- Сорт в кавычках (одинарных ' ') → транслитерировать + обернуть в «»
- Сорт без кавычек (латинское слово/фраза после рода) → транслитерировать + обернуть в «»
- Число в конце = размер горшка, сохранять
- Только описательные слова (Микс, Мини, Деко) — НЕ оборачивать в «»

ТРАНСЛИТЕРАЦИЯ примеров:
'Fascinator' → «Фасцинатор»
'Kerchoveana' → «Керховеана»
Lemon → «Лемон»
'Burle Marx Flame' → «Бёрл Маркс Флейм»
'Thai Constellatio' → «Тай Констеллейшн»
'Variegata' → «Вариегата»
'Leichtlinii' → «Лейхтлинии»
'Monkey Mask' → «Манки Маск»
'Green Beauty' → «Грин Бьюти»
'Imperial Green' → «Империал Грин»
'Imperial Red' → «Империал Ред»
'Red Beauty' → «Ред Бьюти»
'Xanadu' → «Ксанаду»
Choco Empress → «Чоко Импресс»
gloriosum → (уже в названии рода — не добавлять)
Micans → «Миканс»
'Argyraeus' → «Аргиреус»

ПРИМЕРЫ РЕЗУЛЬТАТА:
"Fatsia japonica   ... 17" → "Фатсия Японская 17"
"Fatsia japonica   ... 30" → "Фатсия Японская 30"
"Maranta leuc.   ... 15" → "Маранта Красножильчатая 15"
"Maranta leuc. 'Fascinator' 12" → "Маранта Красножильчатая «Фасцинатор» 12"
"Maranta leuc. 'Kerchoveana' 12" → "Маранта Красножильчатая «Керховеана» 12"
"Maranta leuconeura Lemon 12" → "Маранта Красножильчатая «Лемон» 12"
"Monstera   ... 15" → "Монстера 15"
"Monstera   ... 6" → "Монстера 6"
"Monstera   ... 12" → "Монстера 12"
"Monstera delic. 14" → "Монстера Деликатесная 14"
"Monstera delic. 27" → "Монстера Деликатесная 27"
"Monstera delic. 'Thai Constellatio' 12" → "Монстера Деликатесная «Тай Констеллейшн» 12"
"Monstera delic. 'Variegata' 15" → "Монстера Деликатесная «Вариегата» 15"
"Monstera obliqua 'Leichtlinii' 12" → "Монстера Косая «Лейхтлинии» 12"
"Monstera obliqua 'Monkey Mask' 5" → "Монстера Косая «Манки Маск» 5"
"Monstera pertusum 24" → "Монстера Перфорированная 24"
"Philodendron   ... 12" → "Филодендрон 12"
"Philodendron  'Imperial Green' 12" → "Филодендрон «Империал Грин» 12"
"Philodendron  'Imperial Red' 14" → "Филодендрон «Империал Ред» 14"
"Philodendron  'Xanadu' 24" → "Филодендрон «Ксанаду» 24"
"Philodendron bipinn. 12" → "Филодендрон Двуперистый 12"
"Philodendron scandens 10" → "Филодендрон Лазящий 10"
"Philodendron gloriosum 12" → "Филодендрон Глориозум 12"
"Philodendron melanochrysum 12" → "Филодендрон Меланохризум 12"
"Scindapsus   ... 15" → "Сциндапсус 15"
"Scindapsus pictus 'Argyraeus' 14" → "Сциндапсус Расписной «Аргиреус» 14"

ВЕРНИ ТОЛЬКО JSON без markdown:
${JSON.stringify(names)}

[{"original":"...","translated":"..."}]`

async function callGemini(names, apiKey) {
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: PROMPT_TEMPLATE(names) }] }],
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
    .select('id, name, display_name')
    .eq('subcategory', 'large_leaved')
    .eq('is_active', true)
    .order('id')

  if (error) { console.error('DB error:', error.message); process.exit(1) }

  const untranslated = products.filter(p => p.display_name === p.name)
  console.log(`Всего large_leaved: ${products.length}, нужно перевести: ${untranslated.length}\n`)

  if (untranslated.length === 0) { console.log('Все уже переведены!'); return }

  const names = untranslated.map(p => p.name)
  console.log('Отправляю в Gemini...')
  const results = await callGemini(names, apiKey)

  const isStringArray = typeof results[0] === 'string'
  console.log('\n=== Результат ===')
  const updates = []
  for (let i = 0; i < untranslated.length; i++) {
    const p = untranslated[i]
    const trans = isStringArray ? results[i] : (results[i]?.translated || results[i]?.translation || '')
    if (!trans) { console.warn(`[${p.id}] нет перевода`); continue }
    console.log(`[${p.id}] ${p.name}\n     → ${trans}`)
    updates.push({ id: p.id, display_name: trans })
  }

  console.log(`\n=== Обновляю ${updates.length} записей ===`)
  let ok = 0, err = 0
  for (const u of updates) {
    const { error } = await supabase.from('products').update({ display_name: u.display_name }).eq('id', u.id)
    if (error) { console.error(`ERR ${u.id}:`, error.message); err++ }
    else { process.stdout.write('.'); ok++ }
  }
  console.log(`\n\nГотово: ${ok} обновлено, ${err} ошибок`)
}

run()

// Запуск: node --env-file=.env.local scripts/translate-ficus.mjs
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

const PROMPT_TEMPLATE = (names) => `Ты нормализуешь названия горшечных растений для русскоязычного цветочного каталога.

РОДЫ → русское название:
Ficus benghalensis → Фикус Бенгальский
Ficus benja. (benjamina) → Фикус Бенджамина
Ficus binn. (binnendijkii) → Фикус Биннендейка
Ficus carica → Фикус Карика
Ficus cyathistipula → Фикус Циатистипула
Ficus deltoidea → Фикус Дельтовидный
Ficus elastica → Фикус Эластика
Ficus lyrata → Фикус Лирата
Ficus microcarpa → Фикус Мелкоплодный
Ficus pumila → Фикус Карликовый
Ficus rubiginosa → Фикус Ржавый
Ficus (общее) → Фикус

ПРАВИЛА для сорта:
- Сорт в кавычках (одинарных ' ') → транслитерировать + обернуть в «»
- Число в конце = размер горшка, сохранять

ТРАНСЛИТЕРАЦИЯ примеры:
'Audrey' → «Одри»
'Danielle' → «Даниэль»
'Twilight' → «Твайлайт»
'Starlight' → «Старлайт»
'Amstel King' → «Амстел Кинг»
'Amstel Queen' → «Амстел Куин»
'Robusta' → «Робуста»
'Melany' → «Мелани»
'Tineke' → «Тинеке»
'Burgundy' → «Бургунди»
'Abidjan' → «Абиджан»
'Ginseng' → «Женьшень»
'Moclame' → «Моклам»
'Bambino' → «Бамбино»
'Bush' → «Буш»
'Golden King' → «Голден Кинг»
'Little Lucy' → «Литтл Люси»
'Variegata' → «Вариегата»
'Black Prince' → «Блэк Принс»
'Natasja' → «Наташа»
'Exotica' → «Экзотика»
'Yellow Gem' → «Еллоу Джем»
'Speedy' → «Спиди»

ПРИМЕРЫ РЕЗУЛЬТАТА:
"Ficus benghalensis 'Audrey' 32" → "Фикус Бенгальский «Одри» 32"
"Ficus benja. 'Danielle' 27" → "Фикус Бенджамина «Даниэль» 27"
"Ficus benja. 17" → "Фикус Бенджамина 17"
"Ficus elastica 'Robusta' 14" → "Фикус Эластика «Робуста» 14"
"Ficus lyrata 17" → "Фикус Лирата 17"
"Ficus microcarpa 'Ginseng' 22" → "Фикус Мелкоплодный «Женьшень» 22"
"Ficus binn. 'Amstel King' 24" → "Фикус Биннендейка «Амстел Кинг» 24"

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
    .eq('subcategory', 'ficus')
    .eq('is_active', true)
    .order('id')

  if (error) { console.error('DB error:', error.message); process.exit(1) }

  // Отбираем только те, где display_name совпадает с name (не переведено)
  const untranslated = products.filter(p => p.display_name === p.name)
  console.log(`Всего фикусов: ${products.length}, нужно перевести: ${untranslated.length}\n`)

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

// Запуск: node --env-file=.env.local scripts/translate-cacti-calathea-dracaena.mjs
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

const PRODUCTS = [
  {id:2465,name:"Adenium NB 'Ansu Baobab'"},{id:2468,name:"Cactus   ... 10"},
  {id:2469,name:"Cactus   ... 12"},{id:2466,name:"Cactus   ... 14"},
  {id:2467,name:"Cactus   ... 8"},{id:2470,name:"Cactus   ... 9"},
  {id:2473,name:"Cactus   ...decorated 10"},{id:2471,name:"Cactus   ...decorated 5"},
  {id:2472,name:"Cactus   ...decorated 8"},{id:2474,name:"Cactus   ...hangingplants 9"},
  {id:2477,name:"Cereus   ..."},{id:2476,name:"Cereus   ... 21"},
  {id:2478,name:"Cereus   ... 5"},{id:2475,name:"Cereus   ... 8"},
  {id:2479,name:"Cereus per. 'Monstrosus' 17"},{id:2480,name:"Ceropegia woodii 'Silver Glory' 14"},
  {id:2481,name:"Ceropegia woodii 'Variegata' 12"},{id:2482,name:"Ceropegia woodii 'Variegata' 8"},
  {id:2486,name:"Ceropegia woodii ssp. woodii 12"},{id:2484,name:"Ceropegia woodii ssp. woodii 14"},
  {id:2483,name:"Ceropegia woodii ssp. woodii 6"},{id:2485,name:"Ceropegia woodii ssp. woodii 8"},
  {id:2487,name:"Chamaecereus  'Ubink Cerise' 5"},{id:2488,name:"Chamaecereus  'Ubink Red' 5"},
  {id:2489,name:"Echinocactus grusonii 10"},{id:2490,name:"Echinocactus grusonii 12"},
  {id:2493,name:"Echinocactus grusonii 25"},{id:2492,name:"Echinocactus grusonii 5"},
  {id:2491,name:"Echinocactus grusonii 8"},{id:2494,name:"Echinocactus grusonii forma interme 10"},
  {id:2496,name:"Euphorbia   ... 17"},{id:2495,name:"Euphorbia   ... 24"},
  {id:2497,name:"Euphorbia   ... 9"},{id:2498,name:"Euphorbia (Milii Grp) 'Charlotte' 14"},
  {id:2499,name:"Euphorbia (Milii Grp) Maxi Olympia 13"},{id:2500,name:"Euphorbia abyssinica 27"},
  {id:2501,name:"Euphorbia acrurensis 19"},{id:2502,name:"Euphorbia acrurensis 27"},
  {id:2503,name:"Euphorbia baioensis 17"},{id:2504,name:"Euphorbia candelabrum 27"},
  {id:2505,name:"Euphorbia hyp. 'Diamond Frost' 12"},{id:2506,name:"Euphorbia hyp. 'Euphoria White' 12"},
  {id:2507,name:"Euphorbia ingens 21"},{id:2508,name:"Euphorbia ingens 31"},
  {id:2509,name:"Euphorbia lactea 'Cristata' 12"},
  {id:2511,name:"Calathea   ... 11"},{id:2510,name:"Calathea   ... 12"},
  {id:2513,name:"Calathea   ...mix 17"},{id:2512,name:"Calathea   ...mix 19"},
  {id:2514,name:"Calathea  'Flamestar' 19"},{id:2515,name:"Calathea  'Fusion White' 14"},
  {id:2516,name:"Calathea 'Stella' 14"},{id:2518,name:"Calathea crocata 'Tassmania' 14"},
  {id:2517,name:"Calathea crocata 14"},{id:2519,name:"Calathea lancifolia 14"},
  {id:2520,name:"Calathea makoyana 12"},{id:2521,name:"Calathea makoyana 14"},
  {id:2522,name:"Calathea makoyana 17"},{id:2523,name:"Calathea makoyana 24"},
  {id:2524,name:"Calathea orbifolia 19"},{id:2525,name:"Calathea sanderiana 19"},
  {id:2527,name:"Dracaena   ...mix 12"},{id:2526,name:"Dracaena 12"},
  {id:2528,name:"Dracaena fr de 'Art' 19"},{id:2530,name:"Dracaena fr de 'LemonLime' 17"},
  {id:2529,name:"Dracaena fr de 'LemonLime' 24"},{id:2532,name:"Dracaena fr de 'Ulises' 19"},
  {id:2531,name:"Dracaena fr de 'Ulises' 24"},{id:2534,name:"Dracaena fr de 'Warneckei' 12"},
  {id:2533,name:"Dracaena fr de 'Warneckei' 21"},{id:2535,name:"Dracaena frag. 'Cintho' 13"},
  {id:2537,name:"Dracaena frag. 'Compacta' 12"},{id:2538,name:"Dracaena frag. 'Compacta' 17"},
  {id:2536,name:"Dracaena frag. 'Compacta' 21"},{id:2540,name:"Dracaena frag. 'Janet Craig' 19"},
  {id:2539,name:"Dracaena frag. 'Janet Craig' 24"},{id:2541,name:"Dracaena frag. 'Lemon Surprise' 12"},
  {id:2542,name:"Dracaena frag. 'Malaika' 12"},{id:2543,name:"Dracaena frag. 'Riki' 24"},
  {id:2544,name:"Dracaena frag. 'Tornado' 12"},{id:2545,name:"Dracaena frag. 'Yellow Coast' 17"},
  {id:2553,name:"Dracaena marg. 'Bicolor' 12"},{id:2551,name:"Dracaena marg. 'Bicolor' 17"},
  {id:2552,name:"Dracaena marg. 'Bicolor' 21"},{id:2554,name:"Dracaena marg. 'Magenta' 12"},
  {id:2550,name:"Dracaena marg. 12"},{id:2549,name:"Dracaena marg. 17"},
  {id:2548,name:"Dracaena marg. 24"},{id:2547,name:"Dracaena marg. 27"},
  {id:2546,name:"Dracaena marg. 30"},{id:2555,name:"Dracaena refl.   ... 21"},
  {id:2558,name:"Dracaena surculosa 'Florida Beauty' 12"},{id:2557,name:"Dracaena surculosa 12"},
  {id:2556,name:"Dracaena surculosa 17"},
]

const PROMPT = `Ты нормализуешь названия горшечных растений для русскоязычного цветочного каталога.

РОДЫ → русское название:
Adenium → Адениум
Cactus → Кактус
Cereus → Цереус
Cereus per. (peruvianus) → Цереус Перуанский
Ceropegia woodii / Ceropegia woodii ssp. woodii → Цепочка Сердечек
Chamaecereus → Хамацереус
Echinocactus grusonii → Эхинокактус Грузони
Echinocactus grusonii forma interme → Эхинокактус Грузони Бревиспина
Euphorbia (общее) → Молочай
Euphorbia (Milii Grp) = Crown of Thorns → Молочай Блестящий
Euphorbia abyssinica → Молочай Абиссинский
Euphorbia acrurensis → Молочай Акруренсис
Euphorbia baioensis → Молочай Байоенсис
Euphorbia candelabrum → Молочай Канделябровый
Euphorbia hyp. (hypericifolia) → Молочай
Euphorbia ingens → Молочай Инgens
Euphorbia lactea → Молочай Лактея
Calathea → Калатея
Calathea crocata → Калатея Крокота
Calathea lancifolia → Калатея Ланцетолистная
Calathea makoyana → Калатея Макояна
Calathea orbifolia → Калатея Орбифолия
Calathea sanderiana → Калатея Сандериана
Dracaena (общее) → Драцена
Dracaena fr de (fragrans deremensis) → Драцена Деремская
Dracaena frag. (fragrans) → Драцена Фрагранс
Dracaena marg. (marginata) → Драцена Маргината
Dracaena refl. (reflexa) → Драцена Рефлекса
Dracaena surculosa → Драцена Суркулоза

ПРАВИЛА для сорта:
- Сорт в кавычках (одинарных ' ') → транслитерировать + обернуть в «»
- '...' / '...mix' / '...decorated' / '...hangingplants' без имени сорта → не добавлять «», просто Тип/Микс/Декорированный/Ампельный
- Число в конце = размер горшка, сохранять

ТРАНСЛИТЕРАЦИЯ примеры:
'Ansu Baobab' → «Ансу Баобаб»
'Monstrosus' → «Монстрозус»
'Silver Glory' → «Силвер Глори»
'Variegata' → «Вариегата»
'Ubink Cerise' → «Убинк Серизе»
'Ubink Red' → «Убинк Ред»
'Charlotte' → «Шарлотт»
'Diamond Frost' → «Даймонд Фрост»
'Euphoria White' → «Эйфория Уайт»
'Cristata' → «Кристата»
'Flamestar' → «Фламестар»
'Fusion White' → «Фьюжн Уайт»
'Stella' → «Стелла»
'Tassmania' → «Тасмания»
'Art' → «Арт»
'LemonLime' → «Лемон Лайм»
'Ulises' → «Улисес»
'Warneckei' → «Варнеки»
'Cintho' → «Синтхо»
'Compacta' → «Компакта»
'Janet Craig' → «Джанет Крейг»
'Lemon Surprise' → «Лемон Сюрпрайз»
'Malaika' → «Малайка»
'Riki' → «Рики»
'Tornado' → «Торнадо»
'Yellow Coast' → «Еллоу Коаст»
'Bicolor' → «Биколор»
'Magenta' → «Маджента»
'Florida Beauty' → «Флорида Бьюти»
Maxi Olympia → «Макси Олимпия»

ПРИМЕРЫ РЕЗУЛЬТАТА:
"Cactus   ... 10" → "Кактус 10"
"Cactus   ...decorated 8" → "Кактус Декорированный 8"
"Cactus   ...hangingplants 9" → "Кактус Ампельный 9"
"Cereus   ..." → "Цереус"
"Cereus   ... 5" → "Цереус 5"
"Ceropegia woodii ssp. woodii 12" → "Цепочка Сердечек 12"
"Ceropegia woodii 'Variegata' 8" → "Цепочка Сердечек «Вариегата» 8"
"Echinocactus grusonii 10" → "Эхинокактус Грузони 10"
"Euphorbia   ... 17" → "Молочай 17"
"Euphorbia (Milii Grp) 'Charlotte' 14" → "Молочай Блестящий «Шарлотт» 14"
"Calathea   ... 11" → "Калатея 11"
"Calathea   ...mix 17" → "Калатея Микс 17"
"Calathea makoyana 14" → "Калатея Макояна 14"
"Dracaena   ...mix 12" → "Драцена Микс 12"
"Dracaena fr de 'Art' 19" → "Драцена Деремская «Арт» 19"
"Dracaena frag. 'Compacta' 12" → "Драцена Фрагранс «Компакта» 12"
"Dracaena marg. 12" → "Драцена Маргината 12"
"Dracaena marg. 'Bicolor' 17" → "Драцена Маргината «Биколор» 17"

ВЕРНИ ТОЛЬКО JSON без markdown:
${JSON.stringify(PRODUCTS.map(p => p.name))}

[{"original":"...","translated":"..."}]`

async function callGemini(names, apiKey) {
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: PROMPT }] }],
        generationConfig: { temperature: 0.1, responseMimeType: 'application/json' }
      })
    }
  )
  if (!resp.ok) throw new Error(`Gemini ${resp.status}: ${await resp.text()}`)
  const data = await resp.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Пустой ответ')
  return JSON.parse(text.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim())
}

async function run() {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY
  if (!apiKey) { console.error('GOOGLE_GEMINI_API_KEY не задан'); process.exit(1) }

  console.log(`Переводим ${PRODUCTS.length} позиций...\n`)
  const results = await callGemini(PRODUCTS.map(p => p.name), apiKey)

  // Gemini может вернуть массив строк или массив объектов
  const isStringArray = typeof results[0] === 'string'
  console.log('=== Результат ===')
  const updates = []
  for (let i = 0; i < results.length; i++) {
    const p = PRODUCTS[i]
    if (!p) continue
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

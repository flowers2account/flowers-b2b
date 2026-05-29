// Запуск: node --env-file=.env.local scripts/translate-green-plants.mjs
// Переводит: palms, succulents, polyscias, ferns, zamioculcas, green
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

const PROMPT_TEMPLATE = (names) => `Ты нормализуешь названия горшечных растений для русскоязычного цветочного каталога.

РОДЫ → русское название:

=== ПАЛЬМЫ ===
Chamaedorea → Хамедорея
Chamaedorea cataractarum → Хамедорея Катарактарум
Chamaedorea elegans → Хамедорея Изящная
Chamaerops humilis → Хамеропс Приземистый
Cycas revoluta → Цикас Поникающий
Dypsis lutescens → Дипсис Желтеющий (Арека Пальма)
Howea forsteriana → Ховея Форстера
Livistona rotundifolia → Ливистона Круглолистная
Phoenix canariensis → Финик Канарский
Phoenix roebelenii → Финик Робелини
Washingtonia filifera → Вашингтония Нитеносная

=== СУККУЛЕНТЫ ===
Aeonium → Эониум
Aloe → Алоэ
Aloe arborescens → Алоэ Древовидное
Aloe aristata → Алоэ Аристата
Aloe brevifolia → Алоэ Короткорстное
Aloe humilis → Алоэ Карликовое
Aloe peglerae → Алоэ Пеглера
Aloe variegata → Алоэ Пёстрое
Aloe vera → Алоэ Вера
Cotyledon tome. (tomentosa) → Котиледон Войлочный
Cotyledon undulata → Котиледон Волнистый
Crassula → Крассула
Crassula arborescens → Крассула Древовидная
Crassula coccinea → Крассула Алая
Crassula marnieriana → Крассула Марниерская
Crassula ovata → Крассула Яйцевидная (Денежное Дерево)

=== ПОЛИСЦИАС / ПАХИРА / ЮККА ===
Nolina recurvata → Нолина Изогнутая (Бокарнея)
Pachira aquatica → Пахира Водная
Polyscias scutellaria → Полисциас Щитовидный
Yucca → Юкка
Yucca elephantipes → Юкка Слоновья

=== ПАПОРОТНИКИ ===
Adiantum raddi. (raddianum) → Адиантум Радди
Aglaomorpha coronans → Аглаоморфа Коронованная
Asplenium antiquum → Асплениум Антикум
Asplenium nidus → Асплениум Гнездовой
Blechnum gibbum → Блехнум Горбатый
Dryopteris erythrosora → Щитовник Красносорусный
Microsorum mussi. (musifolium) → Микросорум Мусифолиум
Nephrolepis cord. (cordifolia) → Нефролепис Сердцелистный
Nephrolepis exal. (exaltata) → Нефролепис Возвышенный
Pellaea rotundifolia → Пеллея Круглолистная
Phlebodium aureum → Флебодиум Золотистый
Platycerium bifurc. (bifurcatum) → Платицериум Двувильчатый
Pteris cretica → Птерис Критский
Pteris ensiformis → Птерис Мечевидный

=== ЗАМИОКУЛЬКАС ===
Zamioculcas zamiifolia → Замиокулькас Замиелистный

=== ЗЕЛЁНЫЕ ПРОЧИЕ ===
Aglaonema → Агланема
Alocasia → Алоказия
Alocasia gageana → Алоказия Гейджа
Alocasia zebrina → Алоказия Зебрина
Asparagus → Аспарагус
Asparagus dens. (densiflorus) → Аспарагус Густоцветный
Asparagus densiflorus → Аспарагус Густоцветный
Asparagus falcatus → Аспарагус Серповидный
Asparagus setaceus → Аспарагус Щетинистый
Aspidistra elat. (elatior) → Аспидистра Высокая
Beaucarnea recurvata → Бокарнея Изогнутая
Begonia BD → Бегония
Caladium → Каладиум
Callisia repens → Каллисия Ползучая
Chlorophytum com. (comosum) → Хлорофитум Хохлатый
Chlorophytum orchi. (orchidastrum) → Хлорофитум Орхидаструм

ПРАВИЛА для сорта:
- Сорт в кавычках (одинарных ' ') → транслитерировать + обернуть в «»
- Сорт без кавычек (слово/фраза после рода, не дескриптор) → транслитерировать + «»
- Только дескрипторы (Микс, Мини) — НЕ оборачивать в «»
- Equator, Lemon Mint — имена сортов → транслитерировать в «»
- Число в конце = размер горшка, сохранять

ТРАНСЛИТЕРАЦИЯ примеры сортов:
'Buddha's Temple' → «Буддас Темпл»
'Garnet Surge' → «Гарнет Сёрдж»
'Magical' → «Мэджикал»
'Minova' → «Минова»
Equator → «Экватор»
Lemon Mint → «Лемон Минт»
'Maria' → «Мария»
'Silver Bay' → «Силвер Бэй»
'Silver Queen Compact' → «Силвер Куин Компакт»
kleinbladig Lemon Mint → «Лемон Минт» (kleinbladig = просто тип, не сорт)
'Meyers' → «Мейерс»
'Sprengeri' → «Шпренгери»
'Mazeppa' → «Мазеппа»
'Beleaf' → «Белиф»
rex → (часть названия, не сорт — Бегония Рекс)
'Miss Muffet' → «Мисс Маффет»
'Turtle' → «Тёртл»
'Bonnie' → «Бонни»
'Ocean' → «Оушен»
'Variegatum' → «Вариегатум»
'Vittatum' → «Виттатум»
'Green Orange' → «Грин Оранж»

ПРИМЕРЫ РЕЗУЛЬТАТА:
"Chamaedorea   ... 9" → "Хамедорея 9"
"Chamaedorea cataractarum 19" → "Хамедорея Катарактарум 19"
"Cycas revoluta 21" → "Цикас Поникающий 21"
"Dypsis lutescens 17" → "Дипсис Желтеющий 17"
"Aloe vera 10" → "Алоэ Вера 10"
"Aloe   ... 12" → "Алоэ 12"
"Aloe   ...mix 12" → "Алоэ Микс 12"
"Aloe Equator 12" → "Алоэ «Экватор» 12"
"Crassula ovata 12" → "Крассула Яйцевидная 12"
"Crassula 'Buddha's Temple' 12" → "Крассула «Буддас Темпл» 12"
"Yucca elephantipes 21" → "Юкка Слоновья 21"
"Pachira aquatica 12" → "Пахира Водная 12"
"Nephrolepis exal. 12" → "Нефролепис Возвышенный 12"
"Zamioculcas zamiifolia 12" → "Замиокулькас Замиелистный 12"
"Aglaonema  'Maria' 17" → "Агланема «Мария» 17"
"Aglaonema kleinbladig Lemon Mint 14" → "Агланема «Лемон Минт» 14"
"Alocasia zebrina 19" → "Алоказия Зебрина 19"
"Asparagus dens. 'Sprengeri' 12" → "Аспарагус Густоцветный «Шпренгери» 12"
"Begonia BD 'Beleaf'   ...mix 12" → "Бегония «Белиф» Микс 12"
"Begonia BD rex   ...mix 12" → "Бегония Рекс Микс 12"
"Caladium 'Miss Muffet' 12" → "Каладиум «Мисс Маффет» 12"
"Caladium   ...mix 12" → "Каладиум Микс 12"
"Chlorophytum com. 'Bonnie' 12" → "Хлорофитум Хохлатый «Бонни» 12"

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

  const subcats = ['palms', 'succulents', 'polyscias', 'ferns', 'zamioculcas', 'green']

  const { data: products, error } = await supabase
    .from('products')
    .select('id, name, display_name, subcategory')
    .in('subcategory', subcats)
    .eq('is_active', true)
    .order('subcategory')
    .order('id')

  if (error) { console.error('DB error:', error.message); process.exit(1) }

  const untranslated = products.filter(p => p.display_name === p.name)
  console.log(`Всего в этих категориях: ${products.length}, нужно перевести: ${untranslated.length}\n`)

  if (untranslated.length === 0) { console.log('Все уже переведены!'); return }

  // Батчи по 60 чтобы не перегружать Gemini
  const BATCH = 60
  const batches = []
  for (let i = 0; i < untranslated.length; i += BATCH) batches.push(untranslated.slice(i, i + BATCH))

  let allUpdates = []
  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b]
    console.log(`Батч ${b + 1}/${batches.length}: ${batch.length} позиций...`)
    const names = batch.map(p => p.name)
    const results = await callGemini(names, apiKey)
    const isStringArray = typeof results[0] === 'string'
    for (let i = 0; i < batch.length; i++) {
      const p = batch[i]
      const trans = isStringArray ? results[i] : (results[i]?.translated || results[i]?.translation || '')
      if (trans) allUpdates.push({ id: p.id, display_name: trans, orig: p.name })
      else console.warn(`[${p.id}] нет перевода`)
    }
    if (b < batches.length - 1) await new Promise(r => setTimeout(r, 2000))
  }

  console.log('\n=== Результат ===')
  allUpdates.forEach(u => console.log(`[${u.id}] ${u.orig}\n     → ${u.display_name}`))

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

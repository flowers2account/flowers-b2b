// Запуск: node --env-file=.env.local scripts/translate-outdoor-plants.mjs
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

const PROMPT_TEMPLATE = (names) => `Ты нормализуешь названия уличных и садовых растений для русскоязычного каталога.

РОДЫ → русское название:

=== ЛАВАНДА ===
Lavandula angus. (angustifolia) → Лаванда Узколистная
Lavandula interm. (intermedia) → Лаванда Промежуточная

=== ДЕКОРАТИВНЫЕ ТРАВЫ ===
Acorus gramineus → Аир Злаковый
Carex → Осока
Carex brunnea → Осока Бурая
Carex comans → Осока Власовидная
Carex hachijoensis → Осока Хачиджоэнсис
Carex morrowii → Осока Морроу
Carex oshimensis → Осока Ошима
Deschampsia flexuosa → Щучка Извилистая
Fargesia → Фаргезия
Fargesia nitida → Фаргезия Нитида
Festuca glauca → Овсяница Сизая
Imperata cylindrica → Императа Цилиндрическая
Miscanthus sin. (sinensis) → Мискантус Китайский
Siergras → Декоративная Трава
Stipa calamagrostis → Ковыль Тростниковый
Stipa tenuifolia / tenuissima → Ковыль Тонколистный
Uncinia rubra → Ункиния Красная

=== МНОГОЛЕТНИКИ ===
Aeonium arboreum → Эониум Древовидный
Agave → Агава
Anemone → Анемона
Datura → Датура
Delphinium grand. (grandiflorum) → Дельфиниум Крупноцветковый
Digitalis purpurea → Наперстянка Пурпурная
Echinacea purp. (purpurea) → Эхинацея Пурпурная
Erysimum linifolium → Желтофиоль Льноволистная
Geum chiloense → Гравилат Чилийский
Geum rivale → Гравилат Речной
Gypsophila muralis → Гипсофила Стеновая
Heuchera → Гейхера
Hosta → Хоста
Leucanthemum maximum → Нивяник Крупноцветковый
Leucanthemum sup. (superbum) → Нивяник Великолепный
Nepeta → Котовник
Ocimum → Базилик
Ornithogalum thyrs. → Птицемлечник
Penstemon → Пенстемон
Persicaria capitatum → Горец Головчатый
Rhodanthemum hosm. / hosmariense → Родантемум Хосмаренский
Rotsplanten → Скальное Растение
Sagina subulata → Сагина Шиловидная
Scabiosa columb. (columbaria) → Скабиоза Голубиная
Sedum → Очиток
Sedum cauticola → Очиток Прибрежный
Sedum cyaneum → Очиток Синеватый
Sedum spathulifolium → Очиток Лопатчатый
Sedum spurium → Очиток Ложный
Sempervivum → Молодило
Sempervivum tectorum → Молодило Кровельное

=== ФРУКТОВЫЕ ===
Citrus → Цитрус
Citrus meyeri → Лимон Мейера
Citrus microcarpa → Каламондин
Vitis vinifera → Виноград Культурный

=== ПРЯНЫЕ ТРАВЫ ===
Mentha piperita → Мята Перечная
Mentha spicata → Мята Колосистая
Mentha suaveolens → Мята Душистая
Origanum vulgare → Орегано
Tuinkruiden → Садовые Травы

=== ДЕРЕВЬЯ ===
Acer palmatum → Клён Японский
Acer shirasawanum → Клён Сираsaw
Chamaerops humilis → Хамеропс Приземистый
Ficus carica → Инжир
Ginkgo biloba → Гинкго Двулопастный
Olea europaea → Олива Европейская
Salix integra → Ива Цельнолистная

=== САМШИТ ===
Buxus semp. (sempervirens) → Самшит Вечнозелёный

=== ХВОЙНЫЕ ===
Chamaecyparis laws. (lawsoniana) → Кипарисовик Лоусона
Chamaecyparis obt. (obtusa) → Кипарисовик Тупой
Chamaecyparis pis. (pisifera) → Кипарисовик Гороховый
Cupressus macro. (macrocarpa) → Кипарис Крупноплодный
Juniperus chinensis → Можжевельник Китайский
Juniperus pfitz. (pfitzeriana) → Можжевельник Пфитцера
Juniperus procumbens → Можжевельник Лежачий
Juniperus squamata → Можжевельник Чешуйчатый
Pinus mugo → Сосна Горная
Pinus mugo pumilio → Сосна Горная Пумилио
Pinus mugo subsp. mugo → Сосна Горная
Pinus sylvestris → Сосна Обыкновенная
Taxus baccata → Тис Ягодный
Thuja occid. (occidentalis) → Туя Западная
Thuja plicata → Туя Складчатая

=== ПЛЮЩ ===
Hedera hibernica → Плющ Ирландский

=== ГОРТЕНЗИЯ УЛИЧНАЯ ===
Hydrangea arbor. (arborescens) → Гортензия Древовидная
Hydrangea mac. (macrophylla) → Гортензия Метельчатая
Hydrangea paniculata → Гортензия Метельчатая

=== ВЬЮЩИЕСЯ ===
Aristolochia macrophylla → Кирказон Крупнолистный
Pandorea jasminoides → Пандорея Жасминовидная

=== РОЗА ===
Rosa → Роза уличная

=== КУСТАРНИКИ ===
Buddleja davidii → Будлея Давида
Cistus florentinus → Ладанник Флорентийский
Cordyline indivisa → Кордилина Неделимая
Cotinus cogg. (coggygria) → Скумпия Кожевенная
Euonymus fortunei → Бересклет Форчуна
Hibiscus mosch. (moscheutos) → Гибискус Болотный
Hibiscus syriacus → Гибискус Сирийский
Nandina domestica → Нандина Домашняя
Philadelphus → Чубушник

ПРАВИЛА для сорта:
- Сорт в кавычках (одинарных ' ') или после рода без кавычек → транслитерировать + «»
- Только дескрипторы (Микс, Мини) — НЕ оборачивать
- Число в конце = размер горшка, сохранять
- URL-мусор (%5B...%5D, ?Products=1) — игнорировать

ТРАНСЛИТЕРАЦИЯ примеры:
'Hidcote' → «Хидкот», 'Edelweiss' → «Эдельвейс»
'Aureovariegatus' → «Аурео Вариегатус», 'Bronze Form' → «Бронз Форм»
'Evergold' → «Эвергол», 'Ice Dance' → «Айс Дэнс», 'Everest' → «Эверест»
'Amilime' → «Амилайм», 'Jiuzhaigou 1' → «Цзючжайгоу 1», 'Viking' → «Викинг»
'Black Pearl' → «Блэк Пёрл», 'Compacta Blue' → «Компакта Блю», 'Intens Blue' → «Интенс Блю»
'Red Baron' → «Ред Барон», 'ColGra Pony Tail' → «Пони Тейл», 'Everflame' → «Эверфлейм»
'Velours' → «Велюр», 'Wild Swan' → «Уайлд Свон»
'Hanabee Rose' → «Ханаби Роз», 'Bowles Mauve' → «Боулз Мов»
'Lady Stratheden' → «Леди Стратиден», 'Fleur White' → «Флёр Уайт», 'Gypsy' → «Джипси»
'Indian Summer' → «Индиан Саммер», 'West Star Leo' → «Вест Стар Лео»
'Butterfly Blue' → «Баттерфлай Блю», 'Lidakense' → «Лидакенсе»
'Sachalin' → «Сахалин», 'Cape Blanco' → «Кейп Бланко»
'Spot on deep Rose' → «Спот он Дип Роуз»
Chick Charms Giants Gold Mine → «Чик Чармс Голд Майн»
'Meyer' → «Мейер», 'Variegata' → «Вариегата», 'Compactum' → «Компактум»
'Jordan' → «Джордан», 'Flamingo' → «Фламинго»
'Aurora' → «Аврора», 'Filifer Nana' → «Филифер Нана»
'Goldcrest Wilma' → «Голдкрест Вилма», 'Stricta' → «Стрикта»
'Gold Star' → «Голд Стар», 'Nana' → «Нана»
'Blue Carpet' → «Блю Карпет», 'Blue Star' → «Блю Стар», 'Holger' → «Хольгер»
pumilio → (часть вида, не сорт — в переводе уже есть)
'Watereri' → «Ватерери», 'Brabant' → «Брабант», 'Danica' → «Даника», 'Smaragd' → «Смарагд»
'Whipecord' → «Вайпкорд»
'Annabelle' → «Аннабель», 'Magical Revolution' → «Мэджикал Революшн»
Early Harry → «Эрли Харри», Living Infinity → «Ливинг Инфинити»
'Butterf C Pink' → «Баттерфлай Пинк», 'Butterf CL Purpl' → «Баттерфлай Клаймберс Пёрпл»
'Peko' → «Пеко», 'Royal Purple' → «Роял Пёрпл», 'Harlequin' → «Арлекин»
'Extreme Hot Pink' → «Экстрим Хот Пинк», 'Oak Red' → «Оук Ред», 'Obsessed' → «Обсессид»
'Zagora Pink' → «Загора Пинк», 'African Rose' → «Африкан Роуз»

ПРИМЕРЫ РЕЗУЛЬТАТА:
"Lavandula angus. 'Hidcote' 9" → "Лаванда Узколистная «Хидкот» 9"
"Carex   ...mix 9" → "Осока Микс 9"
"Fargesia nitida 'Black Pearl' 19" → "Фаргезия Нитида «Блэк Пёрл» 19"
"Imperata cylindrica 'Red Baron' 10" → "Императа Цилиндрическая «Ред Барон» 10"
"Siergras   ...   %5BGrass%5D 9" → "Декоративная Трава 9"
"Sedum   ...mix 8" → "Очиток Микс 8"
"Sempervivum   ... 6" → "Молодило 6"
"Sempervivum tectorum 8" → "Молодило Кровельное 8"
"Citrus meyeri 'Meyer' 15" → "Лимон Мейера «Мейер» 15"
"Tuinkruiden   ... 12" → "Садовые Травы 12"
"Thuja occid. 'Smaragd' 30" → "Туя Западная «Смарагд» 30"
"Pinus mugo pumilio 23" → "Сосна Горная Пумилио 23"
"Juniperus squamata 'Blue Star' 19" → "Можжевельник Чешуйчатый «Блю Стар» 19"
"Hydrangea paniculata Early Harry 5" → "Гортензия Метельчатая «Эрли Харри» 5"
"Buddleja davidii 'Butterf C Pink' 19" → "Будлея Давида «Баттерфлай Пинк» 19"
"Rosa   ...mix 12" → "Роза уличная Микс 12"
"Rotsplanten   ...mix   %5BRock plant%5D 10" → "Скальное Растение Микс 10"

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

  const subcats = ['lavender_plant','ornamental_grasses','perennials','fruit_plants','herbs',
                   'trees','buxus','conifers','hedera_outdoor','hydrangeas_outdoor',
                   'climbing_plants','roses_outdoor','outdoor']

  const { data: products, error } = await supabase
    .from('products')
    .select('id, name, display_name, subcategory')
    .in('subcategory', subcats)
    .eq('is_active', true)
    .order('subcategory').order('id')

  if (error) { console.error('DB error:', error.message); process.exit(1) }

  const untranslated = products.filter(p => p.display_name === p.name)
  console.log(`Всего: ${products.length}, нужно перевести: ${untranslated.length}\n`)
  if (untranslated.length === 0) { console.log('Всё переведено!'); return }

  const BATCH = 60
  const batches = []
  for (let i = 0; i < untranslated.length; i += BATCH) batches.push(untranslated.slice(i, i + BATCH))

  let allUpdates = []
  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b]
    console.log(`Батч ${b + 1}/${batches.length}: ${batch.length} позиций...`)
    const results = await callGemini(batch.map(p => p.name), apiKey)
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

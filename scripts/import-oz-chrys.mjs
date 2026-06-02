/**
 * Import OZ Chrysanthemum catalog — all SKUs by oz_product_code.
 * Usage: node --env-file=.env.local scripts/import-oz-chrys.mjs [path.jsonl]
 */
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const JSONL_PATH = process.argv[2] || 'C:/Users/Владелец/Desktop/oz-parser-new/output/Chrysanthemum.jsonl'

// Cultivar part only — prefix added programmatically by variety_type
const CULTIVARS = {
  // ── Одноголовые (Bl) ───────────────────────────────────────────────────────
  'chrys bl alemani':           'Алемани',
  'chrys bl alibaba':           'Алибаба',
  'chrys bl anastasia':         'Анастасия',
  'chrys bl anastasia sunny':   'Анастасия Санни',
  'chrys bl antonov':           'Антонов',
  'chrys bl bellavista':        'Белла Виста',
  'chrys bl brasiliana':        'Бразилиана',
  'chrys bl cipria':            'Чиприя',
  'chrys bl cipria salmon':     'Чиприя Салмон',
  'chrys bl couture':           'Кутюр',
  'chrys bl etrusko':           'Этруско',
  'chrys bl etrusko white':     'Этруско Уайт',
  'chrys bl honeymoon':         'Ханимун',
  'chrys bl jackfruit':         'Джекфрут',
  'chrys bl kalimba':           'Калимба',
  'chrys bl kalimba orange':    'Калимба Оранж',
  'chrys bl kalimba salmon':    'Калимба Салмон',
  'chrys bl lamira':            'Ламира',
  'chrys bl lamira red':        'Ламира Ред',
  'chrys bl magnum':            'Магнум',
  'chrys bl magnum yellow':     'Магнум Йеллоу',
  'chrys bl maracuja':          'Маракуйя',
  'chrys bl mix':               'Микс',
  'chrys bl momoko':            'Момоко',
  'chrys bl monza':             'Монца',
  'chrys bl pip':               'Пип',
  'chrys bl pip pretty':        'Пип Претти',
  'chrys bl pip salmon':        'Пип Салмон',
  'chrys bl rossano':           'Россано',
  'chrys bl rossano charlotte': 'Россано Шарлотт',
  'chrys bl roxo':              'Роксо',
  'chrys bl saffina dark':      'Саффина Дарк',
  'chrys bl stravina':          'Стравина',
  'chrys bl superbowl':         'Супербоул',
  'chrys bl superbowl yellow':  'Супербоул Йеллоу',
  'chrys bl topspin':           'Топспин',
  'chrys bl topspin yellow':    'Топспин Йеллоу',
  'chrys bl tutu':              'Туту',
  'chrys bl undercover':        'Андеркавер',
  // ── Сантини (Sa) ───────────────────────────────────────────────────────────
  'chrys sa aaa balboa':                  'Балбоа',
  'chrys sa adora':                       'Адора',
  'chrys sa antonelli':                   'Антонелли',
  'chrys sa arnura green':                'Арнура Грин',
  'chrys sa aurinko':                     'Ауринко',
  'chrys sa babette':                     'Бабетт',
  'chrys sa baykal':                      'Байкал',
  'chrys sa baykal lunar':                'Байкал Лунар',
  'chrys sa bouncer':                     'Баунсер',
  'chrys sa bowie':                       'Боуи',
  'chrys sa bumper':                      'Бампер',
  'chrys sa calimero apricot':            'Калимеро Эприкот',
  'chrys sa calimero minty':              'Калимеро Минти',
  'chrys sa calimero mix':                'Калимеро Микс',
  'chrys sa calimero pink':               'Калимеро Пинк',
  'chrys sa calimero pink dark':          'Калимеро Пинк Дарк',
  'chrys sa calimero salmon':             'Калимеро Салмон',
  'chrys sa calimero shiny':              'Калимеро Шайни',
  'chrys sa calimero sunny':              'Калимеро Санни',
  'chrys sa country':                     'Кантри',
  'chrys sa davina':                      'Давина',
  'chrys sa doppia':                      'Доппиа',
  'chrys sa doria':                       'Дориа',
  'chrys sa doria cherry':                'Дориа Черри',
  'chrys sa doria orange':                'Дориа Оранж',
  'chrys sa doria pink':                  'Дориа Пинк',
  'chrys sa doria salmon':                'Дориа Салмон',
  'chrys sa doria white':                 'Дориа Уайт',
  'chrys sa ellison':                     'Эллисон',
  'chrys sa ellison gold':                'Эллисон Голд',
  'chrys sa ellison orange':              'Эллисон Оранж',
  'chrys sa ellison salmon':              'Эллисон Салмон',
  'chrys sa ellison sweet':               'Эллисон Свит',
  'chrys sa fabiani pearl':               'Фабиани Перл',
  'chrys sa fabiani white':               'Фабиани Уайт',
  'chrys sa ferry':                       'Ферри',
  'chrys sa green':                       'Зелёная',
  'chrys sa insta':                       'Инста',
  'chrys sa inzell':                      'Инцель',
  'chrys sa jeanny':                      'Джени',
  'chrys sa jeanny peach':                'Джени Пич',
  'chrys sa jinda':                       'Джинда',
  'chrys sa krissi':                      'Крисси',
  'chrys sa lassie':                      'Лесси',
  'chrys sa lubov':                       'Любовь',
  'chrys sa maaradona':                   'Марадона',
  'chrys sa madiba 5 colour rainbow':     'Мадиба 5 Колор Рэйнбоу',
  'chrys sa madiba bico tyolo':           'Мадиба Биколор Тьоло',
  'chrys sa madiba cherry tyolo':         'Мадиба Черри Тьоло',
  'chrys sa madiba dunga red':            'Мадиба Дунга Ред',
  'chrys sa madiba jombe purple':         'Мадиба Джомбе Пёрпл',
  'chrys sa madiba la orange':            'Мадиба Ла Оранж',
  'chrys sa madiba lindi white':          'Мадиба Линди Уайт',
  'chrys sa madiba lummy white':          'Мадиба Ламми Уайт',
  'chrys sa madiba nyaka cream':          'Мадиба Няка Крем',
  'chrys sa madiba ovada orange':         'Мадиба Овада Оранж',
  'chrys sa madiba pink tyolo':           'Мадиба Пинк Тьоло',
  'chrys sa madiba pompon orange':        'Мадиба Помпон Оранж',
  'chrys sa madiba ringa yellow':         'Мадиба Ринга Йеллоу',
  'chrys sa madiba salmon tyolo':         'Мадиба Салмон Тьоло',
  'chrys sa madiba tanga pink':           'Мадиба Танга Пинк',
  'chrys sa madiba tyolo mixed in bucket':'Мадиба Тьоло Микс',
  'chrys sa maverick sunny':              'Маверик Санни',
  'chrys sa maverick white':              'Маверик Уайт',
  'chrys sa miller lavender':             'Миллер Лавендер',
  'chrys sa miller salmon':               'Миллер Салмон',
  'chrys sa miller smokey':               'Миллер Смоки',
  'chrys sa miller sweet':                'Миллер Свит',
  'chrys sa miller white':                'Миллер Уайт',
  'chrys sa miri':                        'Мири',
  'chrys sa miri yellow':                 'Мири Йеллоу',
  'chrys sa mix blossom':                 'Микс Блоссом',
  'chrys sa mix blush':                   'Микс Блаш',
  'chrys sa mix breeze':                  'Микс Бриз',
  'chrys sa mix candy':                   'Микс Кэнди',
  'chrys sa mix cold':                    'Микс Холодный',
  'chrys sa mix pompom':                  'Микс Помпом',
  'chrys sa mix pompon':                  'Микс Помпон',
  'chrys sa mix rainbow':                 'Микс Рэйнбоу',
  'chrys sa mix rainbow (mixbunch)':      'Микс Рэйнбоу',
  'chrys sa mix sweet':                   'Микс Свит',
  'chrys sa mix white-rose-groen':        'Микс Белый-Розовый-Зелёный',
  'chrys sa mix white-yellow-green':      'Микс Белый-Жёлтый-Зелёный',
  'chrys sa mix wild':                    'Микс Вайлд',
  'chrys sa mix yin yang':                'Микс Инь-Ян',
  'chrys sa orange':                      'Оранжевая',
  'chrys sa patrese cream':               'Патрезе Крем',
  'chrys sa patrese pink':                'Патрезе Пинк',
  'chrys sa patrese sunny':               'Патрезе Санни',
  'chrys sa patrese white':               'Патрезе Уайт',
  'chrys sa peptalk':                     'Пептальк',
  'chrys sa pink':                        'Розовая',
  'chrys sa pizarro':                     'Писарро',
  'chrys sa poppy':                       'Поппи',
  'chrys sa purpetta':                    'Пурпетта',
  'chrys sa purpetta red':                'Пурпетта Ред',
  'chrys sa red':                         'Красная',
  'chrys sa rossi cream':                 'Росси Крем',
  'chrys sa rossi lobster':               'Росси Лобстер',
  'chrys sa rossi mix in bucket':         'Росси Микс',
  'chrys sa rossi orange':                'Росси Оранж',
  'chrys sa rossi pink':                  'Росси Пинк',
  'chrys sa rossi salmon':                'Росси Салмон',
  'chrys sa rossi smokey':                'Росси Смоки',
  'chrys sa rossi splendid':              'Росси Сплендид',
  'chrys sa rossi sunny':                 'Росси Санни',
  'chrys sa rossi white':                 'Росси Уайт',
  'chrys sa skippy':                      'Скиппи',
  'chrys sa sun up':                      'Сан Ап',
  'chrys sa sweetheart':                  'Свитхарт',
  'chrys sa toss':                        'Тосс',
  'chrys sa turtle':                      'Тёртл',
  'chrys sa white':                       'Белая',
  'chrys sa yellow':                      'Жёлтая',
  'chrys sa yin yang':                    'Инь-Ян',
  'chrys sa yin yang cream':              'Инь-Ян Крем',
  'chrys sa yin yang mix':                'Инь-Ян Микс',
  'chrys sa yin yang pink':               'Инь-Ян Пинк',
  'chrys sa yin yang smokey':             'Инь-Ян Смоки',
  // ── Ветковые (Sp) ──────────────────────────────────────────────────────────
  'chrys sp abbey':                 'Эбби',
  'chrys sp altaj':                 'Алтай',
  'chrys sp altaj yellow':          'Алтай Йеллоу',
  'chrys sp babe':                  'Бэйб',
  "chrys sp ballerina's":           'Балерина',
  "chrys sp ballerina's pink":      'Балерина Пинк',
  'chrys sp baltica':               'Балтика',
  'chrys sp baltica cream':         'Балтика Крем',
  'chrys sp baltica pink':          'Балтика Пинк',
  'chrys sp baltica salmon':        'Балтика Салмон',
  'chrys sp baltica yellow':        'Балтика Йеллоу',
  'chrys sp bardot':                'Бардо',
  'chrys sp barolo':                'Бароло',
  'chrys sp bartoli':               'Бартоли',
  'chrys sp bolte':                 'Болте',
  'chrys sp bonita':                'Бонита',
  'chrys sp bontempi':              'Бонтемпи',
  'chrys sp caroline':              'Каролин',
  'chrys sp celebrate':             'Селебрейт',
  'chrys sp chic':                  'Шик',
  'chrys sp chic cream':            'Шик Крем',
  'chrys sp commander':             'Коммандер',
  'chrys sp commander pink':        'Коммандер Пинк',
  'chrys sp commander yellow':      'Коммандер Йеллоу',
  'chrys sp copa':                  'Копа',
  'chrys sp daydream':              'Дэйдрим',
  'chrys sp deligreen':             'Делигрин',
  'chrys sp delianne white':        'Делиан Уайт',
  'chrys sp euro':                  'Евро',
  'chrys sp fabienne':              'Фабьен',
  'chrys sp fabienne purple':       'Фабьен Пёрпл',
  'chrys sp fabienne sweet':        'Фабьен Свит',
  'chrys sp feeling green dark':    'Филинг Грин Дарк',
  'chrys sp festival':              'Фестиваль',
  'chrys sp fontina':               'Фонтина',
  'chrys sp frozen':                'Фрозен',
  'chrys sp grecia':                'Греция',
  'chrys sp hardwell':              'Хардвелл',
  'chrys sp haydar':                'Хайдар',
  'chrys sp haydar yellow':         'Хайдар Йеллоу',
  'chrys sp ilonka':                'Илонка',
  'chrys sp kalimba':               'Калимба',
  'chrys sp kalimba orange':        'Калимба Оранж',
  'chrys sp kalimba salmon':        'Калимба Салмон',
  'chrys sp katinka':               'Катинка',
  'chrys sp katinka salmon':        'Катинка Салмон',
  'chrys sp kaya+':                 'Кайа',
  'chrys sp kennedy':               'Кеннеди',
  'chrys sp kennedy cream':         'Кеннеди Крем',
  'chrys sp kennedy rosy':          'Кеннеди Рози',
  'chrys sp korona':                'Корона',
  'chrys sp lamira':                'Ламира',
  'chrys sp letitbe':               'Летит Би',
  'chrys sp letsgo pink':           'Летс Гоу Пинк',
  'chrys sp limoncello':            'Лимончелло',
  'chrys sp lionking':              'Лайон Кинг',
  'chrys sp lumen':                 'Люмен',
  'chrys sp managua orange':        'Манагуа Оранж',
  'chrys sp mercato':               'Меркато',
  'chrys sp mexicano':              'Мексикано',
  'chrys sp mirana':                'Мирана',
  'chrys sp mix 8 colours':         'Микс 8 цветов',
  'chrys sp mix in box':            'Микс ин Бокс',
  'chrys sp mix zentoo fantasy':    'Микс Зентоо Фантази',
  'chrys sp new pink':              'Нью Пинк',
  'chrys sp newton':                'Ньютон',
  'chrys sp optimist':              'Оптимист',
  'chrys sp orangina':              'Оранжина',
  'chrys sp pastela cava':          'Пастела Кава',
  'chrys sp pastela orange':        'Пастела Оранж',
  'chrys sp pastela pink':          'Пастела Пинк',
  'chrys sp pastela salmon':        'Пастела Салмон',
  'chrys sp pastela sunny':         'Пастела Санни',
  'chrys sp pina colada':           'Пина Колада',
  'chrys sp pina colada cream':     'Пина Колада Крем',
  'chrys sp pina colada yellow':    'Пина Колада Йеллоу',
  'chrys sp pomavera':              'Помавера',
  'chrys sp prada':                 'Прада',
  'chrys sp precious':              'Прешес',
  'chrys sp purple star':           'Пёрпл Стар',
  'chrys sp radost':                'Радость',
  'chrys sp radost cream':          'Радость Крем',
  'chrys sp randall':               'Рэндол',
  'chrys sp resq':                  'Реск',
  'chrys sp resq cream':            'Реск Крем',
  'chrys sp resq lucie':            'Реск Люси',
  'chrys sp rihanna':               'Риана',
  'chrys sp ruby star':             'Руби Стар',
  'chrys sp seenity sweet peach':   'Серенити Свит Пич',
  'chrys sp serenity':              'Серенити',
  'chrys sp serenity purple':       'Серенити Пёрпл',
  'chrys sp serenity sweet':        'Серенити Свит',
  'chrys sp stallion white':        'Сталлион Уайт',
  'chrys sp stellini':              'Стеллини',
  'chrys sp stresa':                'Стреза',
  'chrys sp summer love':           'Саммер Лав',
  'chrys sp topspin':               'Топспин',
  'chrys sp zehnya':                'Зеня',
  // ── Прочие ─────────────────────────────────────────────────────────────────
  'chrysanthemum geplozen maracuja': 'Маракуйя',
}

// Normalize OZ color keys → canonical palette keys
const COLOR_MAP = {
  'green_light':         'lime',
  'white_+_black_heart': 'white',
  'orange_yellow':       'yellow_orange',
  'yellow_orange':       'yellow_orange',
}

function normalizeColors(colors) {
  return (colors ?? [])
    .map(c => COLOR_MAP[c] ?? c)
    .filter(c => c && c !== 'unknown')
}

function fixPhotoUrl(url) {
  if (!url) return null
  return url.replace(/image\/fetch\/[^/]+\//, 'image/fetch/f_auto,q_auto/')
}

function getVarietyType(name) {
  const n = name.toLowerCase()
  if (/^chrys bl\b/.test(n)) return 'single'
  if (/^chrys sp\b/.test(n)) return 'spray'
  if (/^chrys sa\b/.test(n)) return 'santini'
  return null
}

function getPrefix(vt) {
  if (vt === 'spray')   return 'Хризантема ветк'
  if (vt === 'santini') return 'Хризантема сант'
  return 'Хризантема одн'
}

const items = readFileSync(JSONL_PATH, 'utf8')
  .replace(/^﻿/, '')
  .split('\n').filter(Boolean).map(l => JSON.parse(l))

console.log(`Total records: ${items.length}`)

let created = 0, updated = 0, errors = 0

for (const item of items) {
  if (!item.oz_product_code) {
    console.error(`SKIP (no oz_product_code): ${item.name}`)
    errors++
    continue
  }

  const nameKey      = (item.name || '').toLowerCase().trim()
  const cultivar     = CULTIVARS[nameKey] ?? null
  const variety_type = getVarietyType(item.name || '')
  const prefix       = getPrefix(variety_type)
  const display_name = cultivar ? `${prefix} ${cultivar}` : `${prefix} ${item.name}`
  const photo        = fixPhotoUrl(item.image_url)
  const farm         = item.farm?.trim() || null
  const colors       = normalizeColors(item.colors)

  const { data: existing, error: fetchErr } = await supabase
    .from('products')
    .select('id, display_name, image_url, country_iso, colors, farm')
    .eq('oz_product_code', item.oz_product_code)
    .maybeSingle()

  if (fetchErr) {
    console.error(`FETCH ERROR ${item.name}:`, fetchErr.message)
    errors++
    continue
  }

  if (existing) {
    const displayIsRaw = !existing.display_name || !existing.display_name.startsWith('Хризантема')
    const { error: updErr } = await supabase
      .from('products')
      .update({
        name:           item.name,
        subcategory:    'chrysanthemums',
        variety_type,
        length_cm:      item.length_cm ?? null,
        pack_size:      item.pack_size ?? null,
        stems_per_pack: item.stems_per_pack ?? null,
        weight_gram:    item.weight_gram ?? null,
        quality_grade:  item.quality_grade ?? null,
        container_code: item.container_code ?? null,
        source:         'oz_catalog',
        is_active:      true,
        qty:            999,
        price:          999,
        ...((!existing.image_url && photo)              ? { image_url: photo }        : {}),
        ...((!existing.country_iso && item.country_iso) ? { country_iso: item.country_iso } : {}),
        ...((!existing.farm && farm)                    ? { farm }                    : {}),
        ...(colors.length ? { colors } : {}),
        ...(displayIsRaw                                ? { display_name }            : {}),
      })
      .eq('id', existing.id)

    if (updErr) { console.error(`UPDATE ERROR ${item.name}:`, updErr.message); errors++ }
    else { updated++ }
  } else {
    const { error: insErr } = await supabase
      .from('products')
      .insert({
        name:           item.name,
        display_name,
        oz_product_code: item.oz_product_code,
        category:       'cut',
        subcategory:    'chrysanthemums',
        variety_type,
        source:         'oz_catalog',
        length_cm:      item.length_cm ?? null,
        pack_size:      item.pack_size ?? null,
        stems_per_pack: item.stems_per_pack ?? null,
        colors,
        country_iso:    item.country_iso ?? 'NL',
        farm,
        image_url:      photo,
        qty:            999,
        price:          999,
        is_active:      true,
      })

    if (insErr) { console.error(`INSERT ERROR ${item.name}:`, insErr.message); errors++ }
    else { created++ }
  }
}

console.log(`\nДone: ${created} created, ${updated} updated, ${errors} errors`)

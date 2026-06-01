/**
 * Import OZ Export Rosa-Ecuador catalog into products table.
 * Deduplicates by name: AA > A1, then longest stem.
 * Usage: node --env-file=.env.local scripts/import-oz-rosa-ecuador.mjs [path]
 */

import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const JSONL_PATH = process.argv[2] || 'C:/Users/Владелец/Desktop/oz-parser-new/output/Rosa-Ecuador.jsonl'

// Cultivar name (lowercase) → Russian display_name
const DISPLAY_NAMES = {
  'rosa ec aloha':                    'Алоха',
  'rosa ec amnesia':                  'Амнезия',
  'rosa ec angelkiss':                'Ангел Кисс',
  'rosa ec atomic':                   'Атомик',
  'rosa ec barista':                  'Бариста',
  'rosa ec be sweet':                 'Би Свит',
  'rosa ec black baccara':            'Блэк Баккара',
  'rosa ec blush':                    'Блаш',
  'rosa ec brighton':                 'Брайтон',
  'rosa ec buttercup':                'Баттеркап',
  'rosa ec cabaret':                  'Кабаре',
  'rosa ec candlelight':              'Кэндлайт',
  'rosa ec candy xpression':          'Кэнди Икспрешн',
  'rosa ec carpe diem':               'Карпе Дием',
  'rosa ec cherry brandy':            'Черри Бренди',
  'rosa ec cherry-o!':                'Черри-О',
  'rosa ec christa':                  'Криста',
  'rosa ec coffee break':             'Кофе Брэйк',
  'rosa ec cool water':               'Кул Вотер',
  'rosa ec coral reef':               'Корал Риф',
  'rosa ec cotton xpression':         'Коттон Икспрешн',
  'rosa ec country home':             'Кантри Хоум',
  'rosa ec country soul':             'Кантри Соул',
  'rosa ec deep purple':              'Дип Пёрпл',
  'rosa ec esperance':                'Эсперанс',
  'rosa ec exotix berry':             'Экзотик Берри',
  'rosa ec explorer':                 'Эксплорер',
  'rosa ec faith':                    'Фейт',
  'rosa ec felicity':                 'Фелисити',
  'rosa ec fiesta':                   'Фиеста',
  'rosa ec free spirit':              'Фри Спирит',
  'rosa ec freedom':                  'Фридом',
  'rosa ec frutetto':                 'Фруттето',
  'rosa ec garden fancy dreams':      'Гарден Фэнси Дримс',
  'rosa ec garden melon xpression':   'Гарден Мелон Икспрешн',
  'rosa ec garden phoenix':           'Гарден Феникс',
  'rosa ec garden vicky gardens':     'Гарден Вики Гарденс',
  'rosa ec green romance':            'Грин Романс',
  'rosa ec hermosa':                  'Хермоза',
  'rosa ec high & magic':             'Хай энд Мэджик',
  'rosa ec iguana':                   'Игуана',
  'rosa ec kahala':                   'Кахала',
  'rosa ec lemonade':                 'Лемонэйд',
  'rosa ec lola':                     'Лола',
  'rosa ec luciano':                  'Лучано',
  'rosa ec mamma mia':                'Мамма Миа',
  'rosa ec mandala':                  'Мандала',
  'rosa ec menta':                    'Ментa',
  'rosa ec mix':                      'Микс',
  'rosa ec mix in box':               'Микс ин Бокс',
  'rosa ec mix rainbow (mixbunch)':   'Микс Рэйнбоу',
  'rosa ec moab':                     'Моаб',
  'rosa ec mondial':                  'Мондиаль',
  'rosa ec news flash':               'Ньюс Флэш',
  'rosa ec nina':                     'Нина',
  'rosa ec ocean song':               'Оушен Сонг',
  'rosa ec orange crush':             'Оранж Краш',
  'rosa ec paint blue':               'Пэйнт Блю',
  'rosa ec paint light blue':         'Пэйнт Лайт Блю',
  'rosa ec paint magic rainbow':      'Пэйнт Мэджик Рэйнбоу',
  'rosa ec paint moonlight':          'Пэйнт Мунлайт',
  'rosa ec paint purple white':       'Пэйнт Пёрпл Уайт',
  'rosa ec paint velvet cloud pink':  'Пэйнт Вельвет Клауд Пинк',
  'rosa ec paloma':                   'Палома',
  'rosa ec pink floyd':               'Пинк Флойд',
  'rosa ec pink mondial':             'Пинк Мондиаль',
  'rosa ec pink xpression':           'Пинк Икспрешн',
  'rosa ec playa blanca':             'Плайя Бланка',
  'rosa ec princess crown':           'Принцесс Краун',
  'rosa ec princess miyuki':          'Принцесс Мийюки',
  'rosa ec purple moon':              'Пёрпл Мун',
  'rosa ec queens crown':             'Квинс Краун',
  'rosa ec quicksand':                'Квиксэнд',
  'rosa ec rosita vendela':           'Росита Вендела',
  'rosa ec sahara':                   'Сахара',
  'rosa ec silantoi':                 'Силантои',
  'rosa ec spray mix in box':         'Спрей Микс ин Бокс',
  'rosa ec sweetnesse':               'Свитнесс',
  'rosa ec the pearl':                'Зе Пёрл',
  'rosa ec tiara':                    'Тиара',
  'rosa ec tibeth':                   'Тибет',
  'rosa ec tiffany':                  'Тиффани',
  'rosa ec toffee':                   'Тоффи',
  'rosa ec topaz':                    'Топаз',
  'rosa ec tutti frutti':             'Тутти Фрутти',
  'rosa ec twilight':                 'Твайлайт',
  'rosa ec tycoon':                   'Тайкун',
  'rosa ec vendela':                  'Вендела',
  'rosa ec vi pink':                  'Ви Пинк',
  'rosa ec vicky gardens':            'Вики Гарденс',
  'rosa garden antonia':              'Антония',
  'rosa garden mayra white':          'Майра Уайт',
}

// Normalize OZ color keys → palette keys
const COLOR_MAP = {
  'orange_light':  'light_orange',
  'orange_yellow': 'yellow_orange',
  'yellow-orange': 'yellow_orange',
  'orange-red':    'orange_red',
  'pink_light':    'pink_light',   // exists in palette
  'pink_white':    'pink_white',   // exists in palette
  'red_white':     'bicolor_red_white',
  'white_red':     'bicolor_red_white',
  'white_green':   'bicolor_white_green',
  'red_dark':      'red_dark',     // exists in palette
}

function normalizeColors(colors) {
  return (colors ?? [])
    .map(c => COLOR_MAP[c] ?? c)
    .filter(c => c !== 'unknown')
}

function fixPhotoUrl(url) {
  if (!url) return null
  return url.replace(/image\/fetch\/[^/]+\//, 'image/fetch/f_auto,q_auto/')
}

function getVarietyType(name) {
  const n = name.toLowerCase()
  if (n.includes('spray') || n.includes('kordana')) return 'spray'
  return 'single'
}

// Each line in JSONL is a unique SKU (unique oz_product_code per length/farm combo)
const items = readFileSync(JSONL_PATH, 'utf8')
  .split('\n').filter(Boolean).map(l => JSON.parse(l))

console.log(`Total records: ${items.length}`)

let created = 0, updated = 0, errors = 0

for (const item of items) {
  if (!item.oz_product_code) { console.error(`SKIP (no oz_product_code): ${item.name}`); errors++; continue }

  const nameKey = item.name.toLowerCase().trim()
  const cultivar = DISPLAY_NAMES[nameKey] ?? null
  const variety_type = getVarietyType(item.name)
  const prefix = variety_type === 'spray' ? 'Роза ветковая' : 'Роза однг'
  const display_name = cultivar ? `${prefix} ${cultivar}` : `${prefix} ${item.name}`
  const photo = fixPhotoUrl(item.image_url)
  const farm = item.farm?.trim() || null
  const colors = normalizeColors(item.colors)

  // Lookup by oz_product_code (unique SKU key)
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
    const displayIsRaw = !existing.display_name || !existing.display_name.startsWith('Роза')
    const { error: updErr } = await supabase
      .from('products')
      .update({
        name: item.name,
        pack_size: item.pack_size,
        stems_per_pack: item.stems_per_pack,
        length_cm: item.length_cm ?? null,
        variety_type,
        source: 'oz_catalog',
        is_active: true,
        qty: 999,
        price: 999,
        ...((!existing.image_url && photo)              ? { image_url: photo }        : {}),
        ...((!existing.country_iso && item.country_iso) ? { country_iso: item.country_iso } : {}),
        ...((!existing.farm && farm)                    ? { farm }                    : {}),
        ...(((!existing.colors?.length) && colors.length) ? { colors }               : {}),
        ...(displayIsRaw                                ? { display_name }            : {}),
      })
      .eq('id', existing.id)

    if (updErr) { console.error(`UPDATE ERROR ${item.name}:`, updErr.message); errors++ }
    else { updated++ }
  } else {
    const { error: insErr } = await supabase
      .from('products')
      .insert({
        name: item.name,
        display_name,
        oz_product_code: item.oz_product_code,
        category: 'cut',
        subcategory: 'roses',
        variety_type,
        source: 'oz_catalog',
        length_cm: item.length_cm ?? null,
        pack_size: item.pack_size,
        stems_per_pack: item.stems_per_pack,
        colors,
        country_iso: item.country_iso ?? 'EC',
        farm,
        image_url: photo,
        qty: 999,
        price: 999,
        is_active: true,
      })

    if (insErr) { console.error(`INSERT ERROR ${item.name} ${item.length_cm}cm:`, insErr.message); errors++ }
    else { created++ }
  }
}

console.log(`\nDone: ${created} created, ${updated} updated, ${errors} errors`)

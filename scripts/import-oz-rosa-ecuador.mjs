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
  'rosa ec aloha':               'Алоха',
  'rosa ec amnesia':             'Амнезия',
  'rosa ec angelkiss':           'Ангел Кисс',
  'rosa ec atomic':              'Атомик',
  'rosa ec barista':             'Бариста',
  'rosa ec be sweet':            'Би Свит',
  'rosa ec black baccara':       'Блэк Баккара',
  'rosa ec blush':               'Блаш',
  'rosa ec brighton':            'Брайтон',
  'rosa ec buttercup':           'Баттеркап',
  'rosa ec cabaret':             'Кабаре',
  'rosa ec candlelight':         'Кэндлайт',
  'rosa ec candy xpression':     'Кэнди Икспрешн',
  'rosa ec carpe diem':          'Карпе Дием',
  'rosa ec cherry brandy':       'Черри Бренди',
  'rosa ec cherry-o!':           'Черри-О',
  'rosa ec christa':             'Криста',
  'rosa ec coffee break':        'Кофе Брэйк',
  'rosa ec cool water':          'Кул Вотер',
  'rosa ec country soul':        'Кантри Соул',
  'rosa ec deep purple':         'Дип Пёрпл',
  'rosa ec esperance':           'Эсперанс',
  'rosa ec explorer':            'Эксплорер',
  'rosa ec fiesta':              'Фиеста',
  'rosa ec free spirit':         'Фри Спирит',
  'rosa ec garden fancy dreams': 'Гарден Фэнси Дримс',
  'rosa ec kahala':              'Кахала',
  'rosa ec mix in box':          'Микс ин Бокс',
  'rosa ec mondial':             'Мондиаль',
  'rosa ec orange crush':        'Оранж Краш',
  'rosa ec paint light blue':    'Пэйнт Лайт Блю',
  'rosa ec paint magic rainbow': 'Пэйнт Мэджик Рэйнбоу',
  'rosa ec paint moonlight':     'Пэйнт Мунлайт',
  'rosa ec paint purple white':  'Пэйнт Пёрпл Уайт',
  'rosa ec paint velvet cloud pink': 'Пэйнт Вельвет Клауд Пинк',
  'rosa ec paloma':              'Палома',
  'rosa ec pink floyd':          'Пинк Флойд',
  'rosa ec pink mondial':        'Пинк Мондиаль',
  'rosa ec playa blanca':        'Плайя Бланка',
  'rosa ec princess miyuki':     'Принцесс Мийюки',
  'rosa ec spray mix in box':    'Спрей Микс ин Бокс',
  'rosa ec sweetnesse':          'Свитнесс',
  'rosa ec tibeth':              'Тибет',
  'rosa ec twilight':            'Твайлайт',
  'rosa ec vendela':             'Вендела',
  'rosa garden antonia':         'Антония',
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

const GRADE_RANK = { AA: 2, A1: 1 }

const raw = readFileSync(JSONL_PATH, 'utf8')
  .split('\n').filter(Boolean).map(l => JSON.parse(l))

// Deduplicate by name: prefer AA, then longest stem
const byName = new Map()
for (const item of raw) {
  const key = item.name.toLowerCase().trim()
  const existing = byName.get(key)
  if (!existing) {
    byName.set(key, item)
    continue
  }
  const newRank = GRADE_RANK[item.quality_grade] ?? 0
  const oldRank = GRADE_RANK[existing.quality_grade] ?? 0
  if (newRank > oldRank) { byName.set(key, item); continue }
  if (newRank === oldRank && (item.length_cm ?? 0) > (existing.length_cm ?? 0)) {
    byName.set(key, item)
  }
}

const items = [...byName.values()]
console.log(`Total records: ${raw.length} → Unique cultivars: ${items.length}`)

let created = 0, updated = 0, errors = 0

for (const item of items) {
  const nameKey = item.name.toLowerCase().trim()
  const display_name = DISPLAY_NAMES[nameKey] ?? null
  const variety_type = getVarietyType(item.name)
  const photo = fixPhotoUrl(item.image_url)
  const farm = item.farm?.trim() || null

  const { data: existing, error: fetchErr } = await supabase
    .from('products')
    .select('id, name, display_name, image_url, country_iso, colors, farm, oz_product_code')
    .eq('name', item.name)
    .maybeSingle()

  if (fetchErr) {
    console.error(`FETCH ERROR ${item.name}:`, fetchErr.message)
    errors++
    continue
  }

  if (existing) {
    const displayNameIsRaw = !existing.display_name || existing.display_name === existing.name
    const { error: updErr } = await supabase
      .from('products')
      .update({
        oz_product_code: item.oz_product_code,
        pack_size: item.pack_size,
        stems_per_pack: item.stems_per_pack,
        variety_type,
        source: 'oz_catalog',
        is_active: true,
        qty: 999,
        price: 999,
        ...((!existing.image_url && photo)             ? { image_url: photo }       : {}),
        ...((!existing.country_iso && item.country_iso)? { country_iso: item.country_iso } : {}),
        ...((!existing.farm && farm)                   ? { farm }                   : {}),
        ...(((!existing.colors || existing.colors.length === 0) && item.colors?.length)
          ? { colors: item.colors } : {}),
        ...((displayNameIsRaw && display_name)         ? { display_name }           : {}),
      })
      .eq('id', existing.id)

    if (updErr) { console.error(`UPDATE ERROR ${item.name}:`, updErr.message); errors++ }
    else { console.log(`  ✓ updated  ${item.name}${display_name ? ' → ' + display_name : ''}`); updated++ }
  } else {
    const { error: insErr } = await supabase
      .from('products')
      .insert({
        name: item.name,
        display_name: display_name ?? item.name,
        oz_product_code: item.oz_product_code,
        category: 'cut',
        subcategory: 'roses',
        variety_type,
        source: 'oz_catalog',
        length_cm: item.length_cm ?? null,
        pack_size: item.pack_size,
        stems_per_pack: item.stems_per_pack,
        colors: item.colors ?? [],
        country_iso: item.country_iso ?? 'EC',
        farm,
        image_url: photo,
        qty: 999,
        price: 999,
        is_active: true,
      })

    if (insErr) { console.error(`INSERT ERROR ${item.name}:`, insErr.message); errors++ }
    else { console.log(`  + inserted ${item.name}${display_name ? ' → ' + display_name : ''}`); created++ }
  }
}

console.log(`\nDone: ${created} created, ${updated} updated, ${errors} errors`)

/**
 * Import all remaining OZ Export cut-flower JSONL files.
 * Deduplicates by cultivar name (genus prefix stripped).
 * Usage: node --env-file=.env.local scripts/import-oz-catalog-all.mjs [folder]
 */

import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const FOLDER = process.argv[2] || 'C:/Users/Владелец/Desktop/oz-parser-new/output'
const SKIP = new Set(['Branches-Wood.jsonl', 'Rosa-Ecuador.jsonl'])

// ── Russian translations ────────────────────────────────────────────────────
const RU = {
  // Chrysanthemums
  'chrys bl antonov':              'Антонов',
  'chrys bl brasiliana':           'Бразилиана',
  'chrys bl lamira':               'Ламира',
  'chrys bl lamira red':           'Ламира Ред',
  'chrys bl magnum':               'Магнум',
  'chrys bl magnum yellow':        'Магнум Еллоу',
  'chrys bl stravina':             'Стравина',
  'chrys bl topspin':              'Топспин',
  'chrys bl tutu':                 'Туту',
  'chrys sa aurinko':              'Ауринко',
  'chrys sa babette':              'Бабетта',
  'chrys sa davina':               'Давина',
  'chrys sa doria salmon':         'Дориа Сальмон',
  'chrys sa miller smokey':        'Миллер Смоки',
  'chrys sa poppy':                'Поппи',
  'chrys sa purpetta':             'Пурпетта',
  'chrys sa rossi mix in bucket':  'Росси Микс',
  'chrys sa rossi pink':           'Росси Пинк',
  'chrys sa rossi salmon':         'Росси Сальмон',
  'chrys sa rossi smokey':         'Росси Смоки',
  'chrys sa yin yang':             'Инь Ян',
  'chrys sp altaj':                'Алтай',
  'chrys sp baltica':              'Балтика',
  'chrys sp bardot':               'Бардо',
  'chrys sp bolte':                'Болте',
  'chrys sp bonita':               'Бонита',
  'chrys sp caroline':             'Каролин',
  'chrys sp chic':                 'Шик',
  'chrys sp commander':            'Командер',
  'chrys sp commander pink':       'Командер Пинк',
  'chrys sp deligreen':            'Делигрин',
  'chrys sp feeling green dark':   'Филинг Грин Дарк',
  'chrys sp festival':             'Фестиваль',
  'chrys sp grecia':               'Греция',
  'chrys sp ilonka':               'Илонка',
  'chrys sp kalimba':              'Калимба',
  'chrys sp kalimba orange':       'Калимба Оранж',
  'chrys sp katinka':              'Катинка',
  'chrys sp kaya+':                'Кая',
  'chrys sp kennedy':              'Кеннеди',
  'chrys sp kennedy rosy':         'Кеннеди Рози',
  'chrys sp limoncello':           'Лимончелло',
  'chrys sp lumen':                'Люмен',
  'chrys sp mirana':               'Мирана',
  'chrys sp mix 8 colours':        'Микс 8 цветов',
  'chrys sp new pink':             'Нью Пинк',
  'chrys sp pastela pink':         'Пастела Пинк',
  'chrys sp pastela sunny':        'Пастела Санни',
  'chrys sp pina colada':          'Пина Колада',
  'chrys sp pomavera':             'Помавера',
  // Rosa (Dutch/large/spray)
  'rosa garden austin juliet':     'Джульетта Остин',
  'rosa garden cafe latte':        'Кафе Латте',
  'rosa garden lavender bq':       'Лавандер',
  'rosa garden princess hitomi':   'Принцесс Хитоми',
  'rosa garden villa romanza':     'Вилла Романца',
  'rosa garden wabara miyabi':     'Мияби',
  'rosa garden westminster abbey': 'Вестминстер Эбби',
  'rosa garden white cloud':       'Уайт Клауд',
  "rosa garden white o'hara":      'Уайт О\'Хара',
  "rosa garden white o'hara (scented)": 'Уайт О\'Хара (аромат)',
  'rosa large alchemy':            'Алхимия',
  'rosa large aqua!':              'Аква',
  'rosa large athena':             'Афина',
  'rosa large athena royale':      'Афина Роял',
  'rosa large atomic':             'Атомик',
  'rosa large austin keira':       'Кейра Остин',
  'rosa large austin patience':    'Пэйшнс Остин',
  'rosa large austin purity':      'Пьюрити Остин',
  'rosa large belle rose':         'Бель Роуз',
  'rosa large dolomiti':           'Доломити',
  'rosa large ever red':           'Эвер Ред',
  'rosa large firefox':            'Файерфокс',
  'rosa large helene':             'Хелен',
  'rosa large jackpot+':           'Джекпот',
  'rosa large jessika':            'Джессика',
  'rosa large madam red':          'Мадам Ред',
  'rosa large marie-claire!':      'Мари-Клэр',
  'rosa large mariyo!':            'Мариё',
  'rosa large moonwalk':           'Мунвок',
  'rosa large nicoletta':          'Николетта',
  'rosa large paloma steffi':      'Палома Стеффи',
  'rosa large red naomi! unica porta nova': 'Ред Наоми',
  'rosa large red tacazzi':        'Ред Такацци',
  'rosa large revival':            'Ривайвл',
  'rosa large rhodos':             'Родос',
  'rosa large snowstorm+':         'Сноустром',
  'rosa large spark condor':       'Спарк Кондор',
  'rosa large tacazzi+':           'Такацци',
  'rosa large top gear':           'Топ Гир',
  'rosa large tycoon':             'Тайкун',
  'rosa large wham':               'Уэм',
  'rosa spray ayala!':             'Аяла',
  'rosa spray bella trendsetter':  'Белла Трендсеттер',
  'rosa spray bombastic':          'Бомбастик',
  'rosa spray bridal flow scented':'Брайдал Флоу',
  'rosa spray destini':            'Дестини',
  'rosa spray eyeliner':           'Айлайнер',
  'rosa spray fireworks':          'Фейерверк',
  'rosa spray garden julietta':    'Гарден Джульетта',
  'rosa spray garden white majolica': 'Гарден Уайт Маджолика',
  'rosa spray gelato':             'Джелато',
}

// ── Per-file config ────────────────────────────────────────────────────────
const CONFIG = {
  'Alstroemeria.jsonl':     { subcategory: 'alstroemeria',  getVT: ()  => null,
    prefixRe: /^alstroemeria\s+(fl\s+)?|^alstro\s+/i,
    preferFullName: true },
  'Anthuriums.jsonl':       { subcategory: 'anthuriums',    getVT: ()  => null,
    prefixRe: /^anthurium\s+/i },
  'Antirrhinum.jsonl':      { subcategory: 'fillers',       getVT: ()  => null,
    prefixRe: /^antirrhinum\s+|^leeuwenbek\s+/i },
  'Aster.jsonl':            { subcategory: 'fillers',       getVT: ()  => null,
    prefixRe: /^aster\s+/i },
  'Astilbe.jsonl':          { subcategory: 'fillers',       getVT: ()  => null,
    prefixRe: /^astilbe\s+/i },
  'Bouvardia.jsonl':        { subcategory: 'fillers',       getVT: ()  => null,
    prefixRe: /^bouvardia\s+(si\s+)?/i },
  'Chamelaucium-Waxflower.jsonl': { subcategory: 'texture', getVT: ()  => null,
    prefixRe: /^chamelaucium\s+/i },
  'Chrysanthemum.jsonl':    { subcategory: 'chrysanthemums',getVT: getChrysVT,
    prefixRe: /^chrys\s+(bl|sp|sa)\s+/i },
  'Cymbidium.jsonl':        { subcategory: 'orchids',       getVT: ()  => null,
    prefixRe: /^cymbidium\s+/i },
  'Delphinium.jsonl':       { subcategory: 'delphiniums',   getVT: ()  => null,
    prefixRe: /^delph(?:inium)?\s+(?:\w+\s+){1,2}/i },
  'Dianthus.jsonl':         { subcategory: 'carnations',    getVT: getDianthusVT,
    prefixRe: /^dianthus\s+(?:br|sp|st|ov)\s+/i },
  'Eryngium.jsonl':         { subcategory: 'fillers',       getVT: ()  => null,
    prefixRe: /^eryngium\s+/i },
  'Exotics.jsonl':          { subcategory: 'accents',       getVT: ()  => null,
    prefixRe: null, getSubcat: getExoticsSubcat },
  'Freesia.jsonl':          { subcategory: 'fillers',       getVT: ()  => null,
    prefixRe: /^freesia\s+(?:do|si|bq\s+x\d+\s+)?\s*/i },
  'Gerbera-Germini.jsonl':  { subcategory: 'gerberas',      getVT: getGerberaVT,
    prefixRe: /^gerbera\s+|^germini\s+/i },
  'Gypsophila.jsonl':       { subcategory: 'fillers',       getVT: ()  => null,
    prefixRe: /^gyps(?:ophila)?\s+/i },
  'Hydrangea.jsonl':        { subcategory: 'hydrangeas',    getVT: ()  => null,
    prefixRe: /^hydrangea\s+/i },
  'Hypericum.jsonl':        { subcategory: 'berries',       getVT: ()  => null,
    prefixRe: /^hypericum\s+(?:coco|mag)\s+/i },
  'Iris.jsonl':             { subcategory: 'spring',        getVT: ()  => null,
    prefixRe: /^iris\s+/i },
  'Rosa.jsonl':             { subcategory: 'roses',         getVT: getRosaVT,
    prefixRe: /^rosa\s+(?:garden|large|spray)\s+/i },
}

function getChrysVT(name) {
  const n = name.toLowerCase()
  if (/^chrys\s+bl\s+/i.test(n)) return 'single'
  if (/^chrys\s+sa\s+/i.test(n)) return 'santini'
  if (/^chrys\s+sp\s+/i.test(n)) return 'spray'
  return null
}

function getDianthusVT(name) {
  const n = name.toLowerCase()
  if (/^dianthus\s+st\s+/i.test(n)) return 'single'
  return 'spray'
}

function getRosaVT(name) {
  if (/^rosa\s+spray\s+/i.test(name.toLowerCase())) return 'spray'
  return 'single'
}

function getGerberaVT(name) {
  if (/^germini\s+/i.test(name.toLowerCase())) return 'mini'
  return 'single'
}

function getExoticsSubcat(name) {
  const n = name.toLowerCase()
  if (/banksia|serruria/.test(n)) return 'proteas'
  if (/strelitzia/.test(n))       return 'seasonal'
  if (/heliconia|jatropha|justicia|bromelia/.test(n)) return 'accents'
  return 'accents'
}

// Strip genus prefix to get the cultivar portion for dedup
function cultivarKey(name, prefixRe) {
  if (!prefixRe) return name.toLowerCase().trim()
  return name.toLowerCase().replace(prefixRe, '').trim()
}

// Build display_name: prefer RU map, else title-case cultivar
function makeDisplayName(name, prefixRe) {
  const key = name.toLowerCase().trim()
  if (RU[key]) return RU[key]
  const cultivar = cultivarKey(name, prefixRe)
  return cultivar
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function fixPhotoUrl(url) {
  if (!url) return null
  return url.replace(/image\/fetch\/[^/]+\//, 'image/fetch/f_auto,q_auto/')
}

const GRADE_RANK = { AA: 2, A1: 1 }

// ── Main ───────────────────────────────────────────────────────────────────
const files = readdirSync(FOLDER)
  .filter(f => f.endsWith('.jsonl') && !SKIP.has(f) && CONFIG[f])
  .sort()

console.log(`Processing ${files.length} files...\n`)

let totalCreated = 0, totalUpdated = 0, totalErrors = 0

for (const file of files) {
  const cfg = CONFIG[file]
  const raw = readFileSync(join(FOLDER, file), 'utf8')
    .split('\n').filter(Boolean).map(l => JSON.parse(l))

  // Deduplicate: by cultivar key, prefer "full name" > AA > longest stem
  const byKey = new Map()
  for (const item of raw) {
    if (!item.name) continue
    const key = cultivarKey(item.name, cfg.prefixRe)
    const existing = byKey.get(key)
    if (!existing) { byKey.set(key, item); continue }
    // Prefer full name over abbreviated
    const itemIsFuller = item.name.length > existing.name.length
    // Prefer higher grade
    const newRank = GRADE_RANK[item.quality_grade] ?? 0
    const oldRank = GRADE_RANK[existing.quality_grade] ?? 0
    if (newRank > oldRank) { byKey.set(key, item); continue }
    if (newRank === oldRank && itemIsFuller) { byKey.set(key, item); continue }
    if (newRank === oldRank && !itemIsFuller && (item.length_cm ?? 0) > (existing.length_cm ?? 0)) {
      byKey.set(key, item)
    }
  }

  const items = [...byKey.values()]
  const subcategory = cfg.subcategory
  let created = 0, updated = 0, errors = 0

  for (const item of items) {
    const display_name = makeDisplayName(item.name, cfg.prefixRe)
    const variety_type = cfg.getVT(item.name)
    const subcat = cfg.getSubcat ? cfg.getSubcat(item.name) : subcategory
    const photo = fixPhotoUrl(item.image_url)
    const farm = item.farm?.trim() || null
    const country_iso = item.country_iso || null

    const { data: existing, error: fetchErr } = await supabase
      .from('products')
      .select('id, name, display_name, image_url, country_iso, colors, farm')
      .eq('name', item.name)
      .maybeSingle()

    if (fetchErr) {
      console.error(`  FETCH ERROR ${item.name}:`, fetchErr.message)
      errors++; continue
    }

    if (existing) {
      const displayIsRaw = !existing.display_name || existing.display_name === existing.name
      const { error: updErr } = await supabase
        .from('products')
        .update({
          oz_product_code: item.oz_product_code,
          pack_size: item.pack_size ?? existing.pack_size,
          stems_per_pack: item.stems_per_pack ?? existing.stems_per_pack,
          variety_type,
          subcategory: subcat,
          source: 'oz_catalog',
          is_active: true,
          qty: 999,
          price: 999,
          ...((!existing.image_url && photo)              ? { image_url: photo }    : {}),
          ...((!existing.country_iso && country_iso)      ? { country_iso }         : {}),
          ...((!existing.farm && farm)                    ? { farm }                : {}),
          ...(((!existing.colors?.length) && item.colors?.length) ? { colors: item.colors } : {}),
          ...((displayIsRaw && display_name)              ? { display_name }        : {}),
        })
        .eq('id', existing.id)
      if (updErr) { console.error(`  UPDATE ERROR ${item.name}:`, updErr.message); errors++ }
      else { updated++ }
    } else {
      const { error: insErr } = await supabase
        .from('products')
        .insert({
          name: item.name,
          display_name,
          oz_product_code: item.oz_product_code,
          category: 'cut',
          subcategory: subcat,
          variety_type,
          source: 'oz_catalog',
          length_cm: item.length_cm ?? null,
          pack_size: item.pack_size ?? null,
          stems_per_pack: item.stems_per_pack ?? null,
          colors: item.colors ?? [],
          country_iso,
          farm,
          image_url: photo,
          qty: 999,
          price: 999,
          is_active: true,
        })
      if (insErr) { console.error(`  INSERT ERROR ${item.name}:`, insErr.message); errors++ }
      else { created++ }
    }
  }

  console.log(`${file}: ${raw.length} records → ${items.length} unique | +${created} created, ~${updated} updated, ${errors} errors`)
  totalCreated += created
  totalUpdated += updated
  totalErrors += errors
}

console.log(`\n=== TOTAL: ${totalCreated} created, ${totalUpdated} updated, ${totalErrors} errors ===`)

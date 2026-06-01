/**
 * Import new OZ Export JSONL files: Lilium, Limonium-Statice,
 * Lisianthus-Eustoma, Matthiola, Orchids (Convallaria).
 * Usage: node --env-file=.env.local scripts/import-oz-new-batch.mjs [folder]
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const FOLDER = process.argv[2] || 'C:/Users/Владелец/Desktop/oz-parser-new/output'

// ── Russian translations ────────────────────────────────────────────────────
const RU = {
  // Lilium LA
  'lilium la':                    'ЛА-гибрид (микс)',
  'lilium la (our choice) orange':'ЛА Оранжевая',
  'lilium la (our choice) pink':  'ЛА Розовая',
  'lilium la (our choice) red':   'ЛА Красная',
  'lilium la (our choice) white': 'ЛА Белая',
  'lilium la (our choice) yellow':'ЛА Жёлтая',
  'lilium la bach':               'Бах',
  'lilium la bach supra':         'Бах Супра',
  'lilium la botero':             'Ботеро',
  'lilium la brindisi':           'Бриндизи',
  'lilium la brindisi magnum':    'Бриндизи Магнум',
  'lilium la brindisi supra':     'Бриндизи Супра',
  'lilium la butterfly sparkle':  'Баттерфлай Спаркл',
  'lilium la butterfly spring':   'Баттерфлай Спринг',
  'lilium la calabria':           'Калабрия',
  'lilium la cortona':            'Кортона',
  'lilium la dark secret':        'Дарк Сикрет',
  'lilium la dbl orange lion':    'Дабл Оранж Лайон',
  'lilium la ducati':             'Дукати',
  'lilium la dutch candy':        'Датч Кэнди',
  'lilium la eyeliner':           'Айлайнер',
  'lilium la flexline mix':       'Флекслайн Микс',
  'lilium la forza red':          'Форца Ред',
  'lilium la hardrock':           'Хардрок',
  'lilium la honesty':            'Хонести',
  // Lilium Asiatic
  'lilium as dutch design':       'Датч Дизайн',
  'lilium as forza red':          'Форца Ред Азиат',
  'lilium as tigerlily apricot fudge':   'Тигровая Эприкот Фадж',
  'lilium as tigerlily arabian knight':  'Тигровая Арабиан Найт',
  'lilium as tigerlily claude shride':   'Тигровая Клод Шрайд',
  'lilium as tigerlily fairy morning':   'Тигровая Фэйри Морнинг',
  'lilium as tigerlily guinea gold':     'Тигровая Гинея Голд',
  'lilium as tigerlily orange':          'Тигровая Оранжевая',
  'lilium as tigerlily sunny morning':   'Тигровая Санни Морнинг',
  'lilium az pink madness':       'Пинк Мэднесс',
  'lilium az twinlife pink':      'Твинлайф Пинк',
  // Lisianthus / Eustoma
  'lisianthus do alissa blue':          'Алисса Голубая',
  'lisianthus do alissa champagne':     'Алисса Шампань',
  'lisianthus do alissa green':         'Алисса Зелёная',
  'lisianthus do alissa lavender':      'Алисса Лавандер',
  'lisianthus do alissa light apricot': 'Алисса Лайт Эприкот',
  'lisianthus do alissa light pink':    'Алисса Лайт Пинк',
  'lisianthus do alissa mix in bucket': 'Алисса Микс',
  'lisianthus do alissa peach':         'Алисса Персик',
  'lisianthus do alissa pink':          'Алисса Розовая',
  'lisianthus do alissa pure white':    'Алисса Белая',
  'eustoma do rosanne light':           'Розанна Лайт',
  // Matthiola (левкой)
  'matthiola aida white':         'Левкой Белый Аида',
  'matthiola apricot':            'Левкой Эприкот',
  'matthiola cerise':             'Левкой Вишнёвый',
  'matthiola champagne':          'Левкой Шампань',
  'matthiola cream':              'Левкой Кремовый',
  'matthiola impala marine':      'Левкой Марин',
  'matthiola lavender':           'Левкой Лавандер',
  'matthiola mathilda lavender':  'Матильда Лавандер',
  'matthiola mathilda pink':      'Матильда Розовая',
  'matthiola milla salmon':       'Милла Сальмон',
  'matthiola pastel pink':        'Левкой Пастельно-розовый',
  'matthiola pink light':         'Левкой Светло-розовый',
  'matthiola purple':             'Левкой Фиолетовый',
  'matthiola red':                'Левкой Красный',
  'matthiola white':              'Левкой Белый',
  // Convallaria (ландыш)
  'convallaria white':            'Ландыш белый',
}

// ── Per-file config ─────────────────────────────────────────────────────────
const CONFIG = [
  {
    file: 'Lilium.jsonl',
    subcategory: 'lilies',
    prefixRe: /^lilium\s+(?:as|az|la)\s+/i,
    getVT: (name) => {
      const n = name.toLowerCase()
      if (/^lilium\s+la\s+/i.test(n)) return 'la'
      if (/^lilium\s+as\s+|^lilium\s+az\s+/i.test(n)) return 'asiatic'
      return null
    },
  },
  {
    file: 'Limonium-Statice.jsonl',
    subcategory: 'fillers',
    prefixRe: /^limonium\s+|^statice\s+/i,
    getVT: () => null,
  },
  {
    file: 'Lisianthus-Eustoma.jsonl',
    subcategory: 'lisianthus',
    prefixRe: /^lisianthus\s+do\s+|^eustoma\s+do\s+/i,
    getVT: () => null,
  },
  {
    file: 'Matthiola.jsonl',
    subcategory: 'fillers',
    prefixRe: /^matthiola\s+(?:mathilda\s+|milla\s+|aida\s+|impala\s+)?/i,
    getVT: () => null,
  },
  {
    file: 'Orchids.jsonl',
    subcategory: 'spring',
    prefixRe: /^convallaria\s+/i,
    getVT: () => null,
  },
]

const GRADE_RANK = { AA: 2, A1: 1 }

function cultivarKey(name, prefixRe) {
  if (!prefixRe) return name.toLowerCase().trim()
  return name.toLowerCase().replace(prefixRe, '').trim()
}

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

let totalCreated = 0, totalUpdated = 0, totalErrors = 0

for (const cfg of CONFIG) {
  const raw = readFileSync(join(FOLDER, cfg.file), 'utf8')
    .split('\n').filter(Boolean).map(l => JSON.parse(l))

  // Deduplicate: by cultivar key, prefer AA > A1 > longest stem
  const byKey = new Map()
  for (const item of raw) {
    if (!item.name) continue
    const key = cultivarKey(item.name, cfg.prefixRe)
    const existing = byKey.get(key)
    if (!existing) { byKey.set(key, item); continue }
    const newRank = GRADE_RANK[item.quality_grade] ?? 0
    const oldRank = GRADE_RANK[existing.quality_grade] ?? 0
    if (newRank > oldRank) { byKey.set(key, item); continue }
    if (newRank === oldRank && (item.length_cm ?? 0) > (existing.length_cm ?? 0)) {
      byKey.set(key, item)
    }
  }

  const items = [...byKey.values()]
  let created = 0, updated = 0, errors = 0

  for (const item of items) {
    const display_name = makeDisplayName(item.name, cfg.prefixRe)
    const variety_type = cfg.getVT(item.name)
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
          oz_product_code: item.oz_product_code ?? existing.oz_product_code,
          pack_size: item.pack_size ?? null,
          stems_per_pack: item.stems_per_pack ?? null,
          subcategory: cfg.subcategory,
          variety_type,
          source: 'oz_catalog',
          is_active: true,
          qty: 999,
          price: 999,
          ...((!existing.image_url && photo)         ? { image_url: photo }    : {}),
          ...((!existing.country_iso && country_iso) ? { country_iso }         : {}),
          ...((!existing.farm && farm)               ? { farm }                : {}),
          ...(((!existing.colors?.length) && item.colors?.length) ? { colors: item.colors } : {}),
          ...((displayIsRaw && display_name)         ? { display_name }        : {}),
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
          oz_product_code: item.oz_product_code ?? null,
          category: 'cut',
          subcategory: cfg.subcategory,
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

  console.log(`${cfg.file}: ${raw.length} recs → ${items.length} unique | +${created} created, ~${updated} updated, ${errors} errors`)
  totalCreated += created
  totalUpdated += updated
  totalErrors += errors
}

console.log(`\n=== TOTAL: ${totalCreated} created, ${totalUpdated} updated, ${totalErrors} errors ===`)

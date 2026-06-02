/**
 * Import OZ Export Branches-Wood catalog into products table.
 * Deduplicates by name, keeps highest quality grade (AA > A1).
 * Usage: node --env-file=.env.local scripts/import-oz-branches.mjs [path/to/Branches-Wood.jsonl]
 */

import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const JSONL_PATH = process.argv[2] || 'C:/Users/Владелец/Desktop/oz-parser-new/output/Branches-Wood.jsonl'

const DISPLAY_NAMES = {
  'betula naturel':      'Берёза натуральная',
  'corylus contorta':    'Лещина закрученная',
  'forsythia yellow':    'Форзиция жёлтая',
  'salix kronkelwilg':   'Ива кудрявая',
  'salix pussy willow':  'Верба (котики)',
  'salix snow flake':    'Ива снежинка',
}

// country_raw → ISO fallback when country_iso is absent
const COUNTRY_RAW_TO_ISO = {
  'ukraine':     'UA',
  'netherlands': 'NL',
  'china':       'CN',
}

function fixPhotoUrl(url) {
  if (!url) return null
  return url.replace(/image\/fetch\/[^/]+\//, 'image/fetch/f_auto,q_auto/')
}

const GRADE_RANK = { AA: 2, A1: 1 }

// Parse all lines, deduplicate by name keeping highest grade
const raw = readFileSync(JSONL_PATH, 'utf8')
  .split('\n').filter(Boolean).map(l => JSON.parse(l))

const byName = new Map()
for (const item of raw) {
  const key = item.name.toLowerCase().trim()
  const existing = byName.get(key)
  const rank = GRADE_RANK[item.quality_grade] ?? 0
  if (!existing || rank > (GRADE_RANK[existing.quality_grade] ?? 0)) {
    byName.set(key, item)
  }
}

const items = [...byName.values()]
console.log(`Unique species: ${items.length}`)

let created = 0, updated = 0, errors = 0

for (const item of items) {
  const nameKey = item.name.toLowerCase().trim()
  const display_name = DISPLAY_NAMES[nameKey] ?? null

  // Resolve country_iso
  const country_iso = item.country_iso
    || COUNTRY_RAW_TO_ISO[(item.country_raw ?? '').toLowerCase()]
    || null

  const photo = fixPhotoUrl(item.image_url)

  const farm = item.farm && /^[\x20-\x7EÀ-ɏЀ-ӿ\s]+$/.test(item.farm) ? item.farm : null

  // Look for existing product by name
  const { data: existing, error: fetchErr } = await supabase
    .from('products')
    .select('id, display_name, name, image_url, country_iso, colors')
    .eq('name', item.name)
    .maybeSingle()

  if (fetchErr) {
    console.error(`FETCH ERROR ${item.name}:`, fetchErr.message)
    errors++
    continue
  }

  if (existing) {
    const displayNameIsRaw = existing.display_name === existing.name
    const { error: updErr } = await supabase
      .from('products')
      .update({
        oz_product_code: item.oz_product_code,
        pack_size: item.pack_size,
        stems_per_pack: item.stems_per_pack,
        length_cm: existing.length_cm ?? item.length_cm ?? null,
        ...((!existing.image_url && photo) ? { image_url: photo } : {}),
        ...((!existing.country_iso && country_iso) ? { country_iso } : {}),
        ...((farm && !existing.farm) ? { farm } : {}),
        ...(((!existing.colors || existing.colors.length === 0) && item.colors?.length)
          ? { colors: item.colors } : {}),
        ...((!existing.display_name || displayNameIsRaw) && display_name
          ? { display_name } : {}),
      })
      .eq('id', existing.id)

    if (updErr) {
      console.error(`UPDATE ERROR ${item.name}:`, updErr.message)
      errors++
    } else {
      console.log(`  ✓ updated  ${item.name}`)
      updated++
    }
  } else {
    const { error: insErr } = await supabase
      .from('products')
      .insert({
        name: item.name,
        display_name: display_name ?? item.name,
        oz_product_code: item.oz_product_code,
        category: 'cut',
        subcategory: 'branches',
        source: 'oz_catalog',
        length_cm: item.length_cm ?? null,
        pack_size: item.pack_size,
        stems_per_pack: item.stems_per_pack,
        colors: item.colors ?? [],
        country_iso,
        farm,
        image_url: photo,
        qty: 999,
        price: 999,
        is_active: true,
      })

    if (insErr) {
      console.error(`INSERT ERROR ${item.name}:`, insErr.message)
      errors++
    } else {
      console.log(`  + inserted ${item.name}`)
      created++
    }
  }
}

console.log(`\nDone: ${created} created, ${updated} updated, ${errors} errors`)

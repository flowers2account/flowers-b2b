/**
 * Parser for Astra Fund Holland BV invoice XLS files.
 * Extracts product lines and generates SQL for:
 *   - translation_memory (EN original → RU translation)
 *   - varieties (cultivar name + species_id)
 *
 * Usage: node scripts/parse-astra-invoice.js <path-to-xls> [--dry-run]
 */

const XLSX = require('xlsx')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

// ── VBN English prefix → species_id ──────────────────────────────────────────
// Order matters: longer/more specific prefixes first
const PREFIX_SPECIES = [
  { p: 'Chr G',        id: 4  }, // chrysanthemum_disbud
  { p: 'Chr T',        id: 5  }, // chrysanthemum_spray
  { p: 'Chr S',        id: 6  }, // chrysanthemum_santini
  { p: 'Li La',        id: 7  }, // lily_la
  { p: 'Li Or',        id: 8  }, // lily_oriental
  { p: 'Li Lo',        id: 9  }, // lily_longiflorum
  { p: 'Ge ',          id: 10 }, // gerbera
  { p: 'Gerbera',      id: 10 },
  { p: 'Germini',      id: 10 },
  { p: 'Tulipa',       id: 11 },
  { p: 'Tu ',          id: 11 }, // tulip
  { p: 'Di St',        id: 12 }, // carnation standard
  { p: 'Lisianthus',   id: 13 },
  { p: 'Eust.',        id: 13 },
  { p: 'Eus ',         id: 13 }, // eustoma
  { p: 'Alstroemeria', id: 14 },
  { p: 'Als ',         id: 14 },
  { p: 'Paeonia',      id: 16 },
  { p: 'Paeo',         id: 16 }, // peony
  { p: 'Ranunculus',   id: 17 },
  { p: 'Ran ',         id: 17 },
  { p: 'Cymbidium',    id: 32 },
  { p: 'Cymb',         id: 32 },
  { p: 'Hyacinthus',   id: 34 },
  { p: 'Hyac',         id: 34 }, // hyacinth
  { p: 'Narcissus',    id: 35 },
  { p: 'Narc',         id: 35 },
  { p: 'Hyp ',         id: 36 }, // hypericum
  { p: 'Lim S',        id: 37 }, // statice/limonium
  { p: 'Statice',      id: 37 },
  { p: 'Chame',        id: 39 }, // chamelaucium
  { p: 'Chamel',       id: 39 },
  { p: 'Matth',        id: 40 }, // matthiola
  { p: 'Brun',         id: 41 }, // brunia
  { p: 'Calla',        id: 42 },
  { p: 'Mimosa',       id: 43 },
  { p: 'Lederv',       id: 44 }, // leatherleaf fern
  { p: 'Tana Pa',      id: 28 }, // tanacetum
  { p: 'Matricaria',   id: 28 },
  { p: 'Parvifolia',   id: 21 }, // eucalyptus
  { p: 'Euc ',         id: 21 },
  { p: 'Gunnii',       id: 21 },
  { p: 'Nicholii',     id: 21 },
  { p: 'Ruscus',       id: 22 },
  { p: 'Rosa Spray',   id: 2  },
  { p: 'R Tr',         id: 2  }, // rose spray
  { p: 'R Gr',         id: 1  }, // rose large-flowered / grandiflora
]

function getSpeciesId(en) {
  const s = (en || '').trim()
  for (const { p, id } of PREFIX_SPECIES) {
    if (s.startsWith(p)) return id
  }
  return null
}

// ── Russian species prefixes to strip when extracting cultivar name ───────────
const RU_SPECIES_PREFIXES = [
  'хризантема одноголовая ',
  'хризантема ветковая ',
  'хризантема сантини ',
  'лилия ла-гибрид ',
  'лилия ла ',
  'лилия восточная ',
  'лилия лонгифлорум ',
  'гербера мини ',
  'гербера ',
  'тюльпан ',
  'гвоздика ',
  'эустома ',
  'лизиантус ',
  'альстромерия ',
  'пион ',
  'ранункулюс ',
  'цимбидиум ',
  'гиацинт ',
  'нарцисс ',
  'гиперикум ',
  'статица ',
  'лимониум ',
  'хамелауциум ',
  'маттиола ',
  'бруния ',
  'калла ',
  'мимоза ',
  'танацетум ',
  'ромашка ',
  'эвкалипт ',
  'рускус ',
  'роза ветковая ',
  'роза кустовая ',
  'роза пионовидная ',
  'роза одноголовая ',
  'роза ',
]

function extractCultivar(ru) {
  if (!ru) return null
  let s = ru.trim().toLowerCase()
  // Strip known Russian species prefix
  for (const prefix of RU_SPECIES_PREFIXES) {
    if (s.startsWith(prefix)) {
      s = s.slice(prefix.length).trim()
      break
    }
  }
  // Strip trailing length pattern like "50", "70/350", "95/55", "60 "
  s = s.replace(/\s+\d+([\/\-]\d+)?(\s+|$)/, ' ').trim()
  s = s.replace(/\s+\d+$/, '').trim()
  return s || null
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const filePath = process.argv[2]
  const dryRun = process.argv.includes('--dry-run')

  if (!filePath) {
    console.error('Usage: node scripts/parse-astra-invoice.js <path-to-xls> [--dry-run]')
    process.exit(1)
  }

  const wb = XLSX.readFile(filePath)
  const sh = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(sh, { header: 1, defval: '' })

  // Data rows: col[0]=1, col[1]='x'
  const dataRows = rows.filter(r => r[0] === 1 && r[1] === 'x')
  console.log(`📦 Total data rows: ${dataRows.length}`)

  // Deduplicate by (en, ru)
  const seen = new Set()
  const products = []
  for (const r of dataRows) {
    const en = (r[4] || '').trim()
    const ru = (r[5] || '').trim()
    const key = `${en.toLowerCase()}|${ru.toLowerCase()}`
    if (!en || seen.has(key)) continue
    seen.add(key)
    products.push({
      en,
      ru,
      length_cm: typeof r[6] === 'number' ? r[6] : null,
      pack_size: typeof r[7] === 'number' ? r[7] : null,
      country_iso: (r[13] || '').trim() || null,
      grower: (r[14] || '').trim() || null,
      species_id: getSpeciesId(en),
    })
  }

  const withTranslation = products.filter(p => p.ru)
  const withoutTranslation = products.filter(p => !p.ru)
  console.log(`✅ With translation: ${withTranslation.length}`)
  console.log(`❓ Without translation: ${withoutTranslation.length}`)

  // ── Build SQL ───────────────────────────────────────────────────────────────

  const tmRows = []
  const varRows = []
  const varSeen = new Set()

  for (const p of withTranslation) {
    const normalized = p.en.toLowerCase().replace(/\s+/g, ' ').trim()
    const normalizedRu = p.ru.toLowerCase().replace(/\s+/g, ' ').trim()

    tmRows.push({
      original: p.en,
      translated: p.ru,
      normalized_original: normalized,
      normalized_translated: normalizedRu,
      species_id: p.species_id,
      country_iso: p.country_iso,
      source: 'manual',
      confidence: 0.95,
    })

    // Variety
    if (p.species_id) {
      const cultivar = extractCultivar(p.ru)
      const varKey = `${p.species_id}|${cultivar}`
      if (cultivar && cultivar.length > 2 && !varSeen.has(varKey)) {
        varSeen.add(varKey)
        varRows.push({ name: cultivar, species_id: p.species_id })
      }
    }
  }

  console.log(`\n📝 translation_memory inserts: ${tmRows.length}`)
  console.log(`🌸 varieties inserts: ${varRows.length}`)

  if (dryRun) {
    console.log('\n--- SAMPLE translation_memory (first 5) ---')
    tmRows.slice(0, 5).forEach(r => console.log(JSON.stringify(r)))
    console.log('\n--- SAMPLE varieties (first 5) ---')
    varRows.slice(0, 5).forEach(r => console.log(JSON.stringify(r)))
    console.log('\n--- Without translation (need AI) ---')
    withoutTranslation.slice(0, 10).forEach(p => console.log(`  ${p.en} [species=${p.species_id}]`))
    return
  }

  // ── Insert into Supabase ────────────────────────────────────────────────────
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )

  // translation_memory
  if (tmRows.length > 0) {
    const { error: tmErr } = await supabase
      .from('translation_memory')
      .upsert(tmRows, { onConflict: 'normalized_original', ignoreDuplicates: true })
    if (tmErr) console.error('TM error:', tmErr.message)
    else console.log(`✅ Inserted ${tmRows.length} translation_memory rows`)
  }

  // varieties
  if (varRows.length > 0) {
    const { error: vErr } = await supabase
      .from('varieties')
      .upsert(varRows, { onConflict: 'name,species_id', ignoreDuplicates: true })
    if (vErr) console.error('Varieties error:', vErr.message)
    else console.log(`✅ Inserted ${varRows.length} varieties rows`)
  }

  // Summary: items without translation (need AI work)
  if (withoutTranslation.length > 0) {
    console.log(`\n⚠️  ${withoutTranslation.length} items have no Russian translation:`)
    withoutTranslation.forEach(p => console.log(`  ${p.en} (${p.country_iso || '?'}) [species=${p.species_id ?? 'unknown'}]`))
  }
}

main().catch(console.error)

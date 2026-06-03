// map-pots-xls.mjs — горшки/кашпо/вазы из 1С → pots / vases
// Нормализация: убирает (уп.N), , шт, пробелы
//
// Запуск: node --env-file=.env.local scripts/map-pots-xls.mjs <path.xls> [--dry-run]

import { createRequire } from 'module'
import { createClient } from '@supabase/supabase-js'
const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

const xlsPath = process.argv[2]
const dryRun  = process.argv.includes('--dry-run')

if (!xlsPath) {
  console.error('Usage: node scripts/map-pots-xls.mjs <path.xls> [--dry-run]')
  process.exit(1)
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

const normName = (s) => (s ?? '')
  .replace(/\s*\(уп\.?\s*\d+\)\s*/gi, ' ')   // убрать (уп.10) / (уп. 5)
  .replace(/,\s*(шт|кг)\.?\s*$/i, '')         // убрать , шт
  .replace(/\s+/g, ' ').trim().toLowerCase()

const isGroupRow = (name) => {
  const n = name.trim()
  return /^итого$/i.test(n) || n.endsWith(',') || n.endsWith(', ') ||
    /^склад/i.test(n) || /^товары /i.test(n)
}

// ── Парсим XLS ────────────────────────────────────────────────────────────────

const wb      = XLSX.readFile(xlsPath)
const sheet   = wb.Sheets[wb.SheetNames[0]]
const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1 })

const xlsItems = []
for (const row of rawRows) {
  const name  = String(row[0] ?? '').trim()
  const qty   = parseFloat(String(row[4] ?? '').replace(/\s/g, '').replace(',', '.'))
  const price = parseFloat(String(row[6] ?? '').replace(/\s/g, '').replace(',', '.'))
  if (!name || name.length < 4 || isNaN(qty) || qty <= 0 || isNaN(price) || price <= 0) continue
  if (isGroupRow(name)) continue
  xlsItems.push({ rawName: name, norm: normName(name), qty: Math.round(qty), price })
}

console.log(`\n📄 XLS: ${xlsItems.length} позиций`)

// ── Загружаем pots + vases из БД ─────────────────────────────────────────────

const PAGE = 900
let from = 0
const dbProducts = []
while (true) {
  const { data, error } = await supabase
    .from('products')
    .select('id, name, subcategory')
    .in('subcategory', ['pots', 'vases'])
    .range(from, from + PAGE - 1)
  if (error || !data?.length) break
  dbProducts.push(...data)
  if (data.length < PAGE) break
  from += PAGE
}

const dbByNorm = new Map()
for (const p of dbProducts) {
  const n = normName(p.name)
  if (!dbByNorm.has(n)) dbByNorm.set(n, [])
  dbByNorm.get(n).push(p)
}

console.log(`🗄️  БД (pots+vases): ${dbProducts.length}\n`)

// ── Маппинг ───────────────────────────────────────────────────────────────────

const toUpdate = []
const toInsert = []

for (const item of xlsItems) {
  const hits = dbByNorm.get(item.norm)
  if (hits?.length) {
    toUpdate.push({ xls: item, db: hits })
  } else {
    toInsert.push(item)
  }
}

console.log(`✅ Совпало (UPDATE): ${toUpdate.length}`)
console.log(`➕ Новых (INSERT):   ${toInsert.length}\n`)

if (toInsert.length && dryRun) {
  console.log('── Не найдены в БД ────────────────────────────────────────────────')
  for (const u of toInsert) {
    console.log(`  + "${u.rawName}"`)
    console.log(`    norm: "${u.norm}"`)
  }
  console.log()
}

if (dryRun) {
  console.log('DRY RUN — изменений нет.')
  process.exit(0)
}

// ── UPDATE ────────────────────────────────────────────────────────────────────

console.log('── UPDATE ──────────────────────────────────────────────────────────')
let updated = 0, updateErrors = 0
for (const { xls, db } of toUpdate) {
  for (const p of db) {
    const { error } = await supabase
      .from('products')
      .update({ qty: xls.qty, price: xls.price, is_active: true })
      .eq('id', p.id)
    if (error) { console.error(`  ❌ id=${p.id}: ${error.message}`); updateErrors++ }
    else { console.log(`  ✅ id=${p.id} [${p.subcategory}] qty=${xls.qty} price=${xls.price}  "${p.name}"`); updated++ }
  }
}

// ── INSERT новых ──────────────────────────────────────────────────────────────

let created = 0, insertErrors = 0
if (toInsert.length) {
  console.log('\n── INSERT новых ────────────────────────────────────────────────────')
  const batch = toInsert.map(item => ({
    name:         item.rawName,
    display_name: item.rawName,
    category:     'accessories',
    subcategory:  'pots',
    qty:          item.qty,
    price:        item.price,
    is_active:    true,
    source:       'uralsk_1c',
  }))
  const { error } = await supabase.from('products').insert(batch)
  if (error) { console.error(`  ❌ INSERT: ${error.message}`); insertErrors = toInsert.length }
  else { created = toInsert.length; console.log(`  ✅ Создано: ${created}`) }
}

console.log(`\n── Итог ──────────────────────────────────────────────────────────`)
console.log(`  Обновлено: ${updated}  (ошибок: ${updateErrors})`)
console.log(`  Создано:   ${created}  (ошибок: ${insertErrors})`)
console.log(`─────────────────────────────────────────────────────────────────\n`)

// map-accessories-xls.mjs
// Маппинг XLS "Оценка склада" (col[0]=name, col[4]=qty, col[6]=price)
// → UPDATE совпавших, INSERT новых в заданной subcategory
//
// Запуск: node --env-file=.env.local scripts/map-accessories-xls.mjs <subcategory> <path.xls> [--dry-run]
// Пример: node --env-file=.env.local scripts/map-accessories-xls.mjs artificial C:/Downloads/искус.xls

import { createRequire } from 'module'
import { createClient } from '@supabase/supabase-js'

const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

const subcategory = process.argv[2]
const xlsPath     = process.argv[3]
const dryRun      = process.argv.includes('--dry-run')

if (!subcategory || !xlsPath) {
  console.error('Usage: node scripts/map-accessories-xls.mjs <subcategory> <path.xls> [--dry-run]')
  process.exit(1)
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

const normName = (s) => (s ?? '').toLowerCase().trim().replace(/\s+/g, ' ')

// Строки-группы 1С: оканчиваются на "," или ",  ", либо итоговые/заголовочные
const isGroupRow = (name) => {
  const n = name.trim()
  if (/^итого$/i.test(n)) return true
  if (n.endsWith(',') || n.endsWith(', ')) return true
  if (/^склад/i.test(n)) return true
  if (/^товары /i.test(n)) return true
  return false
}

// ── 1. Парсим XLS ────────────────────────────────────────────────────────────

const wb      = XLSX.readFile(xlsPath)
const sheet   = wb.Sheets[wb.SheetNames[0]]
const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1 })

const xlsItems = []
for (const row of rawRows) {
  const name  = String(row[0] ?? '').trim()
  const qty   = parseFloat(String(row[4] ?? '').replace(/\s/g, '').replace(',', '.'))
  const price = parseFloat(String(row[6] ?? '').replace(/\s/g, '').replace(',', '.'))
  if (!name || name.length < 4) continue
  if (isNaN(qty) || isNaN(price) || qty <= 0 || price <= 0) continue
  if (isGroupRow(name)) continue
  xlsItems.push({ rawName: name, qty: Math.round(qty), price })
}

console.log(`\n📄 XLS [${subcategory}]: ${xlsItems.length} позиций`)

// ── 2. Загружаем products из БД по subcategory ───────────────────────────────

const PAGE = 900
let from = 0
const dbProducts = []
while (true) {
  const { data, error } = await supabase
    .from('products')
    .select('id, name')
    .eq('subcategory', subcategory)
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

console.log(`🗄️  БД: ${dbProducts.length} продуктов subcategory=${subcategory}\n`)

// ── 3. Маппинг ───────────────────────────────────────────────────────────────

const toUpdate = []
const toInsert = []

for (const item of xlsItems) {
  const norm = normName(item.rawName)
  const hits = dbByNorm.get(norm)
  if (hits?.length) {
    toUpdate.push({ xls: item, db: hits })
  } else {
    toInsert.push(item)
  }
}

// ── 4. Отчёт ─────────────────────────────────────────────────────────────────

console.log(`✅ Совпало (UPDATE): ${toUpdate.length}`)
console.log(`➕ Новых (INSERT):   ${toInsert.length}\n`)

if (toInsert.length) {
  console.log('── Новые товары (будут добавлены) ─────────────────────────────────')
  for (const u of toInsert) {
    console.log(`  + ${u.rawName}  (qty=${u.qty}, price=${u.price})`)
  }
  console.log()
}

if (dryRun) {
  console.log('DRY RUN — изменений не выполнялось.')
  process.exit(0)
}

// ── 5. UPDATE совпавших ───────────────────────────────────────────────────────

console.log('── UPDATE ──────────────────────────────────────────────────────────')
let updated = 0, updateErrors = 0
for (const { xls, db } of toUpdate) {
  for (const p of db) {
    const { error } = await supabase
      .from('products')
      .update({ qty: xls.qty, price: xls.price, is_active: true })
      .eq('id', p.id)
    if (error) {
      console.error(`  ❌ id=${p.id} "${p.name}": ${error.message}`)
      updateErrors++
    } else {
      console.log(`  ✅ id=${p.id} qty=${xls.qty} price=${xls.price}  "${p.name}"`)
      updated++
    }
  }
}

// ── 6. INSERT новых ──────────────────────────────────────────────────────────

let created = 0, insertErrors = 0
if (toInsert.length) {
  console.log('\n── INSERT ──────────────────────────────────────────────────────────')
  const batch = toInsert.map(item => ({
    name:         item.rawName,
    display_name: item.rawName,
    category:     'accessories',
    subcategory,
    qty:          item.qty,
    price:        item.price,
    is_active:    true,
    source:       'uralsk_1c',
  }))
  const { error } = await supabase.from('products').insert(batch)
  if (error) {
    console.error(`  ❌ INSERT batch: ${error.message}`)
    insertErrors = toInsert.length
  } else {
    created = toInsert.length
    console.log(`  ✅ Создано: ${created}`)
  }
}

console.log(`\n── Итог ──────────────────────────────────────────────────────────`)
console.log(`  Обновлено: ${updated}  (ошибок: ${updateErrors})`)
console.log(`  Создано:   ${created}  (ошибок: ${insertErrors})`)
console.log(`─────────────────────────────────────────────────────────────────\n`)

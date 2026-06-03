// map-raznoye-xls.mjs — маппинг фонтанов/подставок из разное.xls → pots
// Нормализация: "ФОНТАН 13,5х13,5х17 #181#232, шт" → "фонтан 13,5*13,5*17"
//
// Запуск: node --env-file=.env.local scripts/map-raznoye-xls.mjs [--dry-run]

import { createRequire } from 'module'
import { createClient } from '@supabase/supabase-js'
const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

const dryRun = process.argv.includes('--dry-run')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

// Нормализация: убрать артикулы, единицы, «х»→«*», десятичную «.»→«,», «с подсветкой» в конец
const normalize = (s) => {
  let r = s
    .replace(/,\s*(шт|кг)\.?\s*$/i, '')           // убрать ед. изм.
    .replace(/\s+#[\d#,\s-]+[#]?\s*$/g, '')        // убрать артикулы
    .replace(/(\d)[хХ](\d)/g, '$1*$2')             // х между цифрами → *
    .replace(/(\d)\.(\d)/g, '$1,$2')               // десятичная точка → запятая
    .replace(/п\/фонтан/gi, 'под фонтан')          // сокращение
    .replace(/\.$/, '')                            // точка в конце
    .replace(/\s+/g, ' ').trim().toLowerCase()
  // нормализуем «фонтан с подсветкой NNN» → «фонтан NNN с подсветкой»
  r = r.replace(/^(фонтан)\s+с подсветкой\s+(.+)$/, '$1 $2 с подсветкой')
  return r
}

const clean1c = normalize
const cleanDb = normalize

const isGroupRow = (name) => {
  const n = name.trim()
  return /^итого$/i.test(n) || n.endsWith(',') || n.endsWith(', ') ||
    /^склад/i.test(n) || /^товары /i.test(n)
}

// ── Парсим XLS ────────────────────────────────────────────────────────────────

const wb = XLSX.readFile('C:/Users/Владелец/Downloads/разное.xls')
const sheet = wb.Sheets[wb.SheetNames[0]]
const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1 })

const xlsItems = []
for (const row of rawRows) {
  const name  = String(row[0] ?? '').trim()
  const qty   = parseFloat(String(row[4] ?? '').replace(/\s/g, '').replace(',', '.'))
  const price = parseFloat(String(row[6] ?? '').replace(/\s/g, '').replace(',', '.'))
  if (!name || name.length < 4 || isNaN(qty) || qty <= 0 || isNaN(price) || price <= 0) continue
  if (isGroupRow(name)) continue
  xlsItems.push({ rawName: name, cleanKey: clean1c(name), qty: Math.round(qty), price })
}

console.log(`\n📄 XLS: ${xlsItems.length} позиций`)

// ── Загружаем фонтаны/подставки из БД ────────────────────────────────────────

const { data: dbProducts } = await supabase
  .from('products')
  .select('id, name')
  .eq('subcategory', 'pots')
  .or('name.ilike.%фонтан%,name.ilike.%подставка%')

const dbByClean = new Map()
for (const p of dbProducts ?? []) {
  const k = cleanDb(p.name)
  if (!dbByClean.has(k)) dbByClean.set(k, [])
  dbByClean.get(k).push(p)
}

console.log(`🗄️  БД (фонтаны/подставки): ${dbProducts?.length}\n`)

// ── Маппинг ───────────────────────────────────────────────────────────────────

const toUpdate  = []
const toInsert  = []

for (const item of xlsItems) {
  const hits = dbByClean.get(item.cleanKey)
  if (hits?.length) {
    toUpdate.push({ xls: item, db: hits })
  } else {
    toInsert.push(item)
  }
}

console.log(`✅ Совпало (UPDATE): ${toUpdate.length}`)
console.log(`➕ Новых (INSERT):   ${toInsert.length}\n`)

if (toUpdate.length) {
  console.log('── Совпадения ─────────────────────────────────────────────────────')
  for (const { xls, db } of toUpdate) {
    console.log(`  "${xls.rawName}"`)
    console.log(`    → ${db.map(p => `id=${p.id} "${p.name}"`).join(', ')}`)
    console.log(`    qty=${xls.qty}  price=${xls.price}`)
  }
  console.log()
}

if (toInsert.length) {
  console.log('── Новые (не найдены в БД) ────────────────────────────────────────')
  for (const u of toInsert) {
    console.log(`  + "${u.rawName}"  cleanKey="${u.cleanKey}"`)
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
    else { console.log(`  ✅ id=${p.id} qty=${xls.qty} price=${xls.price}  "${p.name}"`); updated++ }
  }
}

// ── INSERT новых ──────────────────────────────────────────────────────────────

let created = 0, insertErrors = 0
if (toInsert.length) {
  console.log('\n── INSERT ──────────────────────────────────────────────────────────')
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

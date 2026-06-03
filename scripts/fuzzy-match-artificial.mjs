import { createRequire } from 'module'
import { createClient } from '@supabase/supabase-js'
const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

const clean1c = (s) => s
  .replace(/,\s*(шт|кг|пог\. ?м)\.?\s*$/i, '')
  .replace(/\s+#[\d\s,#-]+[#]?\s*$/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase()

const wb = XLSX.readFile('C:/Users/Владелец/Downloads/искус.xls')
const sheet = wb.Sheets[wb.SheetNames[0]]
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 })

const xlsNames = []
for (const row of rows) {
  const name = String(row[0] ?? '').trim()
  const qty = parseFloat(String(row[4] ?? ''))
  const price = parseFloat(String(row[6] ?? ''))
  if (!name || name.length < 4 || isNaN(qty) || qty <= 0 || isNaN(price) || price <= 0) continue
  if (/^итого$/i.test(name) || name.endsWith(',') || name.endsWith(', ') || /^склад/i.test(name) || /^товары /i.test(name)) continue
  xlsNames.push({ raw: name, clean: clean1c(name), qty: Math.round(qty), price })
}

const { data: dbProducts } = await sb.from('products').select('id, name').eq('subcategory', 'artificial')
const dbByClean = new Map()
for (const p of dbProducts) {
  const c = p.name.toLowerCase().trim().replace(/\s+/g, ' ')
  if (!dbByClean.has(c)) dbByClean.set(c, [])
  dbByClean.get(c).push(p)
}

let matched = 0, unmatched = 0
for (const item of xlsNames) {
  const hits = dbByClean.get(item.clean)
  if (hits) {
    matched++
    console.log('MATCH  1C: ' + JSON.stringify(item.raw))
    console.log('       DB: ' + hits.map(h => h.id + ' "' + h.name + '"').join(', '))
    console.log()
  } else {
    unmatched++
    console.log('NOMATCH: ' + JSON.stringify(item.clean) + '  [raw: ' + item.raw + ']')
  }
}
console.log('\nСовпало:', matched, '| Нет пары:', unmatched)

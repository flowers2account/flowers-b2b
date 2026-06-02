import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

const file = process.argv[2]
if (!file) { console.error('Usage: node scripts/preview-xls.mjs path/to/file.xls'); process.exit(1) }

const wb = XLSX.readFile(file)
const sheet = wb.Sheets[wb.SheetNames[0]]
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 })
const offset = parseInt(process.argv[3] ?? '0')
rows.slice(offset, offset + 50).forEach((r, i) => console.log(i+offset, JSON.stringify(r)))
console.log('... total rows:', rows.length)

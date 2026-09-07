// ─────────────────────────────────────────────────────────────────────────────
// MERGE (одноразовая миграция КОММИТ 1): core-harvest (реальные RefEnstru)
//        + curated enstru_index.json (148 доверенных строк цветочного домена)
//        → новый production data/enstru/enstru_index.json
//
//   node scripts/ktru-index-merge.mjs \
//     --harvest=data/enstru/enstru_core_harvest.json \
//     --current=data/enstru/enstru_index.json \      # база curated-строк
//     --out=data/enstru/enstru_index.json            # по умолчанию — на месте
//     [--dry]                                        # только показать статистику
//
// После миграции production-файл — это уже core (~29k). Дальнейшее расширение —
// НЕ этим скриптом, а scripts/ktru-harvest-incremental.mjs (upsert на месте).
// Повторный прогон идемпотентен (все коды уже присутствуют → 0 добавлено).
//
// ПРАВИЛА (см. ТЗ КОММИТ 1 §2):
//   * существующие 148 curated-строк — доверенные; НЕ удаляются;
//   * для существующего кода НЕ перезаписываем доверенные поля
//     (planCount, units, seenVia, descExample, yearCounts, aliases, subjectTypes,
//      years, source, nameRu) — только дозаполняем пустые nameKz / descRu / descKz;
//   * новый код из harvest — добавляем как есть;
//   * синтетических кодов не создаём (harvest уже гарантирует реальность);
//   * wrapper формата не меняем: { generated, source, disclaimer, count, rows }.
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'node:fs'
import path from 'node:path'

const A = process.argv.slice(2)
const flag = (k, d) => {
  const hit = A.find((x) => x === `--${k}` || x.startsWith(`--${k}=`))
  if (!hit) return d
  const eq = hit.indexOf('=')
  return eq === -1 ? true : hit.slice(eq + 1)
}

const HARVEST = path.resolve(process.cwd(), String(flag('harvest', 'data/enstru/enstru_core_harvest.json')))
const CURRENT = path.resolve(process.cwd(), String(flag('current', 'data/enstru/enstru_index.json')))
const OUT = path.resolve(process.cwd(), String(flag('out', 'data/enstru/enstru_index.json')))
const DRY = !!flag('dry', false)

const CODE_FMT = /^[0-9]{6}\.[0-9]{3}\.[0-9]{6}$/

const readRows = (p) => {
  const j = JSON.parse(fs.readFileSync(p, 'utf8'))
  return Array.isArray(j) ? j : j.rows
}

const curated = readRows(CURRENT)
const harvest = readRows(HARVEST)

const byCode = new Map()
for (const r of curated) byCode.set(r.code, { ...r })

let filledNameKz = 0
let filledDescRu = 0
let filledDescKz = 0
let added = 0
let overlap = 0
let skippedBadFmt = 0

for (const h of harvest) {
  if (!CODE_FMT.test(h.code)) {
    skippedBadFmt++
    continue
  }
  const cur = byCode.get(h.code)
  if (!cur) {
    byCode.set(h.code, {
      code: h.code,
      nameRu: h.nameRu || '',
      nameKz: h.nameKz || '',
      descExample: h.descExample || '',
      descRu: h.descRu || '',
      descKz: h.descKz || '',
      kpvedClass: h.kpvedClass || h.code.slice(0, 6),
      kpvedGroup: h.kpvedGroup || h.code.slice(7, 10),
      kpvedPosition: h.kpvedPosition || h.code.slice(11),
      units: Array.isArray(h.units) ? h.units : [],
      subjectTypes: Array.isArray(h.subjectTypes) ? h.subjectTypes : [],
      seenVia: Array.isArray(h.seenVia) ? h.seenVia : ['goszakup:core-harvest'],
      years: Array.isArray(h.years) ? h.years : [],
      planCount: h.planCount || 0,
      source: h.source || 'goszakup:core-harvest',
    })
    added++
    continue
  }
  overlap++
  // дозаполняем ТОЛЬКО пустые скалярные поля, доверенные не трогаем
  if ((!cur.nameKz || !cur.nameKz.trim()) && h.nameKz && h.nameKz.trim()) {
    cur.nameKz = h.nameKz.trim()
    filledNameKz++
  }
  if ((cur.descRu === undefined || cur.descRu === '') && h.descRu && h.descRu.trim()) {
    cur.descRu = h.descRu.trim()
    filledDescRu++
  }
  if ((cur.descKz === undefined || cur.descKz === '') && h.descKz && h.descKz.trim()) {
    cur.descKz = h.descKz.trim()
    filledDescKz++
  }
}

const rows = [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code))

// проверки целостности
const dupCheck = new Set()
let dups = 0
for (const r of rows) {
  if (dupCheck.has(r.code)) dups++
  dupCheck.add(r.code)
}
const badFmt = rows.filter((r) => !CODE_FMT.test(r.code)).length
const emptyName = rows.filter((r) => !r.nameRu).length
const curatedCodes = new Set(curated.map((r) => r.code))
const curatedPreserved = rows.filter((r) => curatedCodes.has(r.code)).length

const body = {
  generated: new Date().toISOString(),
  source:
    'goszakup ows v3 GraphQL — PlnPoint.RefEnstru (authoritative code/nameRu/nameKz/descRu/descKz). ' +
    'CORE: стратифицированный скан планов 2024–2026 (scripts/ktru-harvest-full.mjs). ' +
    'MERGED поверх curated-индекса цветочного домена (planCount/units/seenVia/yearCounts сохранены).',
  disclaimer:
    'Каждый код реально возвращён API для реальной позиции плана — синтетических кодов нет. ' +
    'Для harvest-строк planCount=0 и descExample пустой (в отличие от curated-строк). ' +
    'Инкрементальное расширение — scripts/ktru-harvest-incremental.mjs.',
  count: rows.length,
  rows,
}

console.log('──────── ktru-index-merge ────────')
console.log('curated rows in:      ', curated.length)
console.log('harvest rows in:      ', harvest.length)
console.log('  bad code fmt skipped:', skippedBadFmt)
console.log('overlap (code in both):', overlap)
console.log('  filled nameKz:      ', filledNameKz)
console.log('  filled descRu:      ', filledDescRu)
console.log('  filled descKz:      ', filledDescKz)
console.log('new codes added:      ', added)
console.log('─────────────────────────────────')
console.log('merged total rows:    ', rows.length)
console.log('curated preserved:    ', curatedPreserved, '/', curated.length, curatedPreserved === curated.length ? '✓' : '✗ ПОТЕРЯ')
console.log('duplicate codes:      ', dups)
console.log('bad code format:      ', badFmt)
console.log('empty nameRu:         ', emptyName)

if (DRY) {
  console.log('\n[dry] выход без записи. Итоговый файл был бы', (Buffer.byteLength(JSON.stringify(body, null, 1)) / 1024 / 1024).toFixed(2), 'MB')
  process.exit(0)
}

if (curatedPreserved !== curated.length) {
  console.error('\n✗ ОТКАЗ: часть curated-кодов потерялась при merge. Файл не записан.')
  process.exit(1)
}

const tmp = OUT + '.tmp'
fs.writeFileSync(tmp, JSON.stringify(body, null, 1))
fs.renameSync(tmp, OUT)
console.log('\nwritten →', path.relative(process.cwd(), OUT), (fs.statSync(OUT).size / 1024 / 1024).toFixed(2), 'MB')

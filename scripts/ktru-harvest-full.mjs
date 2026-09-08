// ─────────────────────────────────────────────────────────────────────────────
// KTRU CORE HARVEST — сбор реального справочника ЕНС ТРУ из Goszakup V3.
//
//   node --env-file=.env.local scripts/ktru-harvest-full.mjs --years=2024,2025,2026
//   node --env-file=.env.local scripts/ktru-harvest-full.mjs --years=2024,2025,2026 --resume
//
// В Goszakup V3 НЕТ отдельного справочника ЕНС ТРУ (root-query / REST-ref нет —
// проверено introspection + /v3/refs). Единственный носитель кода+названия+описания —
// PlnPoint.RefEnstru. Скрипт стратифицированно (равномерные стартовые точки по
// диапазону id → по всему выбранному периоду) сканирует Plans/PlnPoint c page=200
// (сервер режет любой limit до 200), дедуплицирует по RefEnstru.code.
// Значения берутся КАК ЕСТЬ из ответа API. Коды не генерируются.
//
// БЕЗОПАСНОСТЬ: read-only к API; пишет только в --out / --checkpoint; ничего не
// коммитит; production-индекс не трогает (merge — отдельный шаг ktru-index-merge.mjs).
//
// CHECKPOINT/RESUME: собранные строки периодически сбрасываются в --out (атомарно,
// через .tmp+rename); прогресс по стратам — в --checkpoint. С флагом --resume
// строки из --out подхватываются обратно, завершённые страты пропускаются.
// Повторный прогон идемпотентен (дедуп по коду).
//
// ФЛАГИ
//   --years=2024,2025,2026   фильтр plnPointYear (пусто = все годы 2013…н.в.)
//   --year=2026              одиночный год (совместимость)
//   --concurrency=24         параллельных страт
//   --strata=900             стартовых точек по диапазону id
//   --pages-per-stratum=12   последовательных страниц (по 200) из каждой страты
//   --target-points=2000000  мягкая цель по числу PlnPoint (0 = не ограничивать)
//   --budget-seconds=0       стена по времени (0 = без лимита)
//   --max-requests=0         предохранитель по числу запросов (0 = без лимита)
//   --flush-every=200        как часто (в запросах) сбрасывать --out + checkpoint
//   --resume                 продолжить прошлый прогон
//   --test-search            прогнать тестовые запросы через searchKtru после сбора
//   --out=data/enstru/enstru_core_harvest.json
//   --stats-out=data/enstru/enstru_core_harvest.stats.json
//   --checkpoint=data/enstru/ktru-harvest-full.checkpoint.json
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'node:fs'
import path from 'node:path'
import { gql } from '../src/lib/goszakup/client.ts'

const A = process.argv.slice(2)
const flag = (k, d) => {
  const hit = A.find((x) => x === `--${k}` || x.startsWith(`--${k}=`))
  if (!hit) return d
  const eq = hit.indexOf('=')
  return eq === -1 ? true : hit.slice(eq + 1)
}
const num = (k, d) => {
  const v = flag(k, undefined)
  return v === undefined ? d : Number(v)
}

function parseYears() {
  const many = flag('years', '')
  const one = flag('year', '')
  const raw = (many && many !== true ? String(many) : one && one !== true ? String(one) : '')
  return raw
    .split(/[,\s]+/)
    .map((x) => parseInt(x, 10))
    .filter((x) => Number.isFinite(x))
    .sort((a, b) => a - b)
}

const CFG = {
  years: parseYears(),
  concurrency: num('concurrency', 24),
  strata: num('strata', 900),
  pagesPerStratum: num('pages-per-stratum', 12),
  targetPoints: num('target-points', 2_000_000),
  budgetSeconds: num('budget-seconds', 0),
  maxRequests: num('max-requests', 0),
  flushEvery: num('flush-every', 200),
  resume: !!flag('resume', false),
  testSearch: !!flag('test-search', false),
  out: String(flag('out', 'data/enstru/enstru_core_harvest.json')),
  statsOut: String(flag('stats-out', 'data/enstru/enstru_core_harvest.stats.json')),
  checkpoint: String(flag('checkpoint', 'data/enstru/ktru-harvest-full.checkpoint.json')),
}

const CODE_FMT = /^[0-9]{6}\.[0-9]{3}\.[0-9]{6}$/
const OUT = path.resolve(process.cwd(), CFG.out)
const STATS = path.resolve(process.cwd(), CFG.statsOut)
const CKPT = path.resolve(process.cwd(), CFG.checkpoint)

const yearFilter = CFG.years.length ? `filter:{ plnPointYear:[${CFG.years.join(',')}] }, ` : ''
const buildQuery = (after) => `{ Plans(${yearFilter}limit:200, after:${after}){
    id refEnstruCode plnPointYear refUnitsCode refSubjectTypeId
    RefEnstru{ code nameRu nameKz descRu descKz }
} }`

// ── аккумуляторы ──
const codes = new Map() // code -> {code,nameRu,nameKz,descRu,descKz,units:Set,subjectTypes:Set,years:Set,_seen}
const names = new Set()
const doneStrata = new Set() // startId завершённых страт
let requests = 0
let pointsScanned = 0
let emptyRef = 0
let malformed = 0
const malformedSamples = new Set()
let stop = false
let sinceFlush = 0
const curve = []
let started = Date.now()
let baseElapsed = 0 // секунды из прошлых прогонов (resume)
const elapsed = () => baseElapsed + (Date.now() - started) / 1000

function ingest(rows) {
  for (const p of rows) {
    pointsScanned++
    const ref = p.RefEnstru
    const code = (ref?.code || p.refEnstruCode || '').trim()
    if (!code) {
      emptyRef++
      continue
    }
    if (!CODE_FMT.test(code)) {
      malformed++
      if (malformedSamples.size < 40) malformedSamples.add(code)
      continue
    }
    if (ref?.nameRu) names.add(ref.nameRu.trim())
    let e = codes.get(code)
    if (!e) {
      e = {
        code,
        nameRu: (ref?.nameRu || '').trim(),
        nameKz: (ref?.nameKz || '').trim(),
        descRu: (ref?.descRu || '').trim(),
        descKz: (ref?.descKz || '').trim(),
        units: new Set(),
        subjectTypes: new Set(),
        years: new Set(),
        _seen: 0,
      }
      codes.set(code, e)
    }
    e._seen++
    if (p.plnPointYear) e.years.add(Number(p.plnPointYear))
    if (p.refUnitsCode != null && String(p.refUnitsCode).trim()) e.units.add(String(p.refUnitsCode).trim())
    if (p.refSubjectTypeId != null) e.subjectTypes.add(Number(p.refSubjectTypeId))
    if (!e.nameKz && ref?.nameKz) e.nameKz = ref.nameKz.trim()
    if (!e.descRu && ref?.descRu) e.descRu = ref.descRu.trim()
    if (!e.descKz && ref?.descKz) e.descKz = ref.descKz.trim()
  }
}

async function fetchPage(after) {
  requests++
  const r = await gql(buildQuery(after), { tries: 4, timeoutMs: 60000 })
  return { rows: r.data?.Plans ?? [], pageInfo: r.extensions?.pageInfo }
}

function budgetHit() {
  return (
    stop ||
    (CFG.maxRequests && requests >= CFG.maxRequests) ||
    (CFG.budgetSeconds && elapsed() >= CFG.budgetSeconds) ||
    (CFG.targetPoints && pointsScanned >= CFG.targetPoints)
  )
}

// одна страта = pagesPerStratum последовательных страниц вниз от start
async function runStratum(start) {
  if (doneStrata.has(start)) return
  let after = start
  for (let p = 0; p < CFG.pagesPerStratum; p++) {
    if (budgetHit()) return
    let res
    try {
      res = await fetchPage(after)
    } catch (e) {
      process.stderr.write(`  ! page after=${after} failed: ${e.message}\n`)
      return // не помечаем страту done — resume её переиграет
    }
    ingest(res.rows)
    sinceFlush++
    if (requests % 25 === 0 || requests < 6) {
      curve.push({ requests, points: pointsScanned, uniqueKtru: codes.size, uniqueNames: names.size, t: Math.round(elapsed()) })
      process.stderr.write(
        `  req ${requests} | points ${pointsScanned} | KTRU ${codes.size} | names ${names.size} | ${Math.round(elapsed())}s\n`,
      )
    }
    if (sinceFlush >= CFG.flushEvery) {
      sinceFlush = 0
      flush(false)
    }
    if (!res.pageInfo?.hasNextPage || !res.rows.length) break
    const next = res.pageInfo.lastId
    if (next === after) break
    after = next
  }
  doneStrata.add(start)
}

async function pool(starts) {
  let idx = 0
  const workers = Array.from({ length: CFG.concurrency }, async () => {
    while (!budgetHit() && idx < starts.length) {
      const my = starts[idx++]
      await runStratum(my)
    }
    if (budgetHit()) stop = true
  })
  await Promise.all(workers)
}

// ── сериализация ──
function rowsForOutput() {
  return [...codes.values()]
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((e) => ({
      code: e.code,
      nameRu: e.nameRu,
      nameKz: e.nameKz,
      descExample: '',
      descRu: e.descRu,
      descKz: e.descKz,
      kpvedClass: e.code.slice(0, 6),
      kpvedGroup: e.code.slice(7, 10),
      kpvedPosition: e.code.slice(11),
      units: [...e.units].sort(),
      subjectTypes: [...e.subjectTypes].sort((a, b) => a - b),
      seenVia: ['goszakup:core-harvest'],
      years: [...e.years].sort(),
      planCount: 0, // точный planCount не запрашивался (экономия запросов); заполняется отдельно
      source: 'goszakup:core-harvest',
    }))
}

function atomicWrite(file, text) {
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, text)
  fs.renameSync(tmp, file)
}

function flush(final) {
  const rows = rowsForOutput()
  const body = {
    generated: new Date().toISOString(),
    source:
      'goszakup ows v3 GraphQL — PlnPoint.RefEnstru, stratified id-space scan' +
      (CFG.years.length ? ` (plnPointYear ${CFG.years.join(',')})` : ' (все годы)'),
    disclaimer:
      'Ядро справочника ЕНС ТРУ. Каждый код реально возвращён API для реальной ' +
      'позиции плана — синтетических кодов нет. planCount=0 (не запрашивался). ' +
      'descExample пустой (заполняется при merge из curated-индекса). ' +
      (final ? 'Финальный снимок.' : 'Промежуточный снимок (harvest не завершён).'),
    count: rows.length,
    rows,
  }
  atomicWrite(OUT, JSON.stringify(body, null, 1))
  atomicWrite(
    CKPT,
    JSON.stringify(
      {
        config: CFG,
        complete: !!final,
        doneStrata: [...doneStrata].sort((a, b) => a - b),
        stats: {
          requests,
          pointsScanned,
          uniqueKtru: codes.size,
          uniqueNames: names.size,
          elapsedSeconds: Math.round(elapsed()),
          emptyRef,
          malformed,
        },
        curve,
        updatedAt: new Date().toISOString(),
      },
      null,
      1,
    ),
  )
}

function loadResume() {
  if (!CFG.resume) return
  if (fs.existsSync(OUT)) {
    const prev = JSON.parse(fs.readFileSync(OUT, 'utf8'))
    for (const r of prev.rows || []) {
      codes.set(r.code, {
        code: r.code,
        nameRu: r.nameRu || '',
        nameKz: r.nameKz || '',
        descRu: r.descRu || '',
        descKz: r.descKz || '',
        units: new Set(r.units || []),
        subjectTypes: new Set(r.subjectTypes || []),
        years: new Set(r.years || []),
        _seen: 0,
      })
      if (r.nameRu) names.add(r.nameRu)
    }
  }
  if (fs.existsSync(CKPT)) {
    const ck = JSON.parse(fs.readFileSync(CKPT, 'utf8'))
    for (const s of ck.doneStrata || []) doneStrata.add(s)
    requests = ck.stats?.requests || 0
    pointsScanned = ck.stats?.pointsScanned || 0
    emptyRef = ck.stats?.emptyRef || 0
    malformed = ck.stats?.malformed || 0
    baseElapsed = ck.stats?.elapsedSeconds || 0
    for (const c of ck.curve || []) curve.push(c)
  }
  process.stderr.write(
    `[resume] codes=${codes.size} doneStrata=${doneStrata.size} requests=${requests} points=${pointsScanned}\n`,
  )
}

async function main() {
  console.error(`[ktru-harvest-full] config: ${JSON.stringify(CFG)}`)
  loadResume()
  started = Date.now()

  const head = await fetchPage(0)
  ingest(head.rows)
  const idMax = head.pageInfo?.lastId || 87_800_000
  const totalCount = head.pageInfo?.totalCount ?? 0
  console.error(`[ktru-harvest-full] Plans totalCount(filter) = ${totalCount.toLocaleString('ru-RU')}, idMax ≈ ${idMax}`)

  // нижняя граница id для выбранного периода: бинарным зондом ищем самый маленький id
  let idMin = 200_000
  if (CFG.years.length) {
    let lo = 200_000
    let hi = idMax
    for (let i = 0; i < 24 && hi - lo > 50_000; i++) {
      const mid = Math.floor((lo + hi) / 2)
      const r = await fetchPage(mid)
      if ((r.rows || []).length) hi = mid
      else lo = mid
    }
    idMin = lo
    console.error(`[ktru-harvest-full] нижняя граница id для периода ≈ ${idMin}`)
  }

  const starts = []
  for (let k = 0; k < CFG.strata; k++) {
    const frac = k / CFG.strata
    starts.push(Math.round(idMax - frac * (idMax - idMin)))
  }

  await pool(starts)
  flush(!stop && doneStrata.size >= starts.length)

  // ── статистика ──
  const rows = rowsForOutput()
  const outBytes = fs.statSync(OUT).size
  const cov = { nameRu: 0, nameKz: 0, descRu: 0, descKz: 0, nameOnly: 0, withUnits: 0 }
  let fieldSum = 0
  for (const r of rows) {
    const f = [!!r.nameRu, !!r.nameKz, !!r.descRu, !!r.descKz]
    if (f[0]) cov.nameRu++
    if (f[1]) cov.nameKz++
    if (f[2]) cov.descRu++
    if (f[3]) cov.descKz++
    if (f[0] && !f[1] && !f[2] && !f[3]) cov.nameOnly++
    if (r.units.length) cov.withUnits++
    fieldSum += f.filter(Boolean).length
  }
  const stats = {
    generatedAt: new Date().toISOString(),
    source: 'goszakup-v3',
    method: 'stratified PlnPoint scan (Plans, page=200, after=lastId, id DESC), dedup by RefEnstru.code',
    config: CFG,
    complete: !stop && doneStrata.size >= starts.length,
    apiHasKtruDictionaryEndpoint: false,
    years: CFG.years,
    planPointsScanned: pointsScanned,
    uniqueKtru: codes.size,
    uniqueNames: names.size,
    apiRequests: requests,
    elapsedSeconds: Math.round(elapsed()),
    strataDone: doneStrata.size,
    strataTotal: starts.length,
    outputJsonBytes: outBytes,
    outputRows: rows.length,
    fieldCoverage: { ...cov, avgFieldsPopulated: rows.length ? +(fieldSum / rows.length).toFixed(2) : 0 },
    malformedCodes: malformed,
    malformedSamples: [...malformedSamples],
    emptyRefEnstru: emptyRef,
    plansTotalCountForFilter: totalCount,
    plansTotalCountAllYears: 40_969_277,
    discoveryCurve: curve,
  }
  atomicWrite(STATS, JSON.stringify(stats, null, 2))

  const L = (k, v) => console.log(k.padEnd(26) + v)
  console.log('\n──────── ktru-harvest-full ────────')
  L('Years:', CFG.years.length ? CFG.years.join(', ') : 'все')
  L('Complete:', stats.complete + ` (страт ${doneStrata.size}/${starts.length})`)
  L('PlnPoints scanned:', pointsScanned.toLocaleString('ru-RU'))
  L('Unique KTRU:', codes.size.toLocaleString('ru-RU'))
  L('Unique names:', names.size.toLocaleString('ru-RU'))
  L('API requests:', requests.toLocaleString('ru-RU'))
  L('Elapsed:', Math.round(elapsed()) + 's')
  L('Output JSON size:', (outBytes / 1024 / 1024).toFixed(2) + ' MB')
  L('Avg fields populated:', stats.fieldCoverage.avgFieldsPopulated + ' / 4')
  L('  с nameKz:', cov.nameKz)
  L('  с descRu:', cov.descRu)
  L('  с descKz:', cov.descKz)
  L('  с units:', cov.withUnits)
  L('  только nameRu:', cov.nameOnly)
  L('malformed (skip):', malformed.toLocaleString('ru-RU'))
  L('empty RefEnstru:', emptyRef)
  console.log('output →', CFG.out)
  console.log('stats  →', CFG.statsOut)
  console.log('ckpt   →', CFG.checkpoint)

  if (CFG.testSearch) await testSearch(rows)
}

async function testSearch(rows) {
  const { searchKtru } = await import('../src/lib/ktru/search.ts')
  const queries = [
    'перчатки', 'перчатки нитриловые', 'перчатки медицинские', 'қолғап', 'перчтаки',
    'кабель', 'кабель ВВГ', 'бумага А4', 'стул', 'ноутбук', 'цемент', 'труба',
    'лампа', 'удобрение', 'грунт', 'горшок', 'роза', 'автомобиль', 'шприц', 'маска', 'мебель',
  ]
  console.log('\n──────── test search (свежесобранный core) ────────')
  for (const q of queries) {
    let res
    try {
      res = searchKtru(q, { index: rows, limit: 5 })
    } catch (e) {
      console.log(`\n${q}\n  ERROR ${e.message}`)
      continue
    }
    console.log(`\n${q}  → candidates: ${res.length}`)
    res.forEach((r, i) =>
      console.log(
        `  ${i + 1}. ${r.score.toFixed(3)}  ${r.code}  ${r.nameRu}` +
          (r.descRu ? ` — ${r.descRu.slice(0, 46)}` : '') +
          `  via[${(r.retrievedVia || []).join(',')}]`,
      ),
    )
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

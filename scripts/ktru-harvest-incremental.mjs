// ─────────────────────────────────────────────────────────────────────────────
// INCREMENTAL KTRU HARVEST — добор новых/изменённых ЕНС ТРУ с прошлого запуска.
//
//   node --env-file=.env.local scripts/ktru-harvest-incremental.mjs
//   node --env-file=.env.local scripts/ktru-harvest-incremental.mjs --dry
//
// МЕХАНИЗМ. У Plans есть аргумент after_index_date, НО в текущей версии API он
// стабильно отдаёт "Internal server error" (проверено во всех форматах даты).
// Поэтому рабочий механизм — ВОДОРАЗДЕЛ ПО id: id пунктов плана монотонно растёт
// и ≈ хронологичен, after:0 отдаёт самые новые. Идём сверху вниз, пока не уйдём
// ниже (lastMaxPlanPointId − overlap). Дату всё равно фиксируем в чекпоинте
// (lastSuccessfulIndexDate) — на случай, когда after_index_date починят
// (--try-index-date попробует его как быстрый путь с авто-фолбэком).
//
// ИДЕМПОТЕНТНОСТЬ: overlap-окно перечитывается каждый раз; upsert по коду →
// повторный прогон не плодит дубли и не портит curated-поля.
//
// ЧЕКПОИНТ: data/enstru/ktru-harvest-state.json (НЕ внутри большого индекса).
//
// БЕЗОПАСНОСТЬ: read-only к API. Единственная запись в runtime — этот скрипт,
// запускаемый вручную / по cron; НЕ из обработчика пользовательского поиска.
//
// ФЛАГИ
//   --index=data/enstru/enstru_index.json     обновляемый production-индекс
//   --state=data/enstru/ktru-harvest-state.json
//   --overlap-ids=150000     сколько id перечитывать сверх водораздела (страховка)
//   --lookback-ids=500000    глубина ПЕРВОГО запуска, если чекпоинта ещё нет
//   --max-requests=1500      предохранитель
//   --concurrency=1          последовательно (идём строго сверху вниз)
//   --try-index-date         сначала попробовать after_index_date, при ошибке — id
//   --dry                    не писать ни индекс, ни чекпоинт
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

const CFG = {
  index: String(flag('index', 'data/enstru/enstru_index.json')),
  state: String(flag('state', 'data/enstru/ktru-harvest-state.json')),
  overlapIds: num('overlap-ids', 150_000),
  lookbackIds: num('lookback-ids', 500_000),
  maxRequests: num('max-requests', 1500),
  tryIndexDate: !!flag('try-index-date', false),
  dry: !!flag('dry', false),
}

const IDX = path.resolve(process.cwd(), CFG.index)
const STATE = path.resolve(process.cwd(), CFG.state)
const CODE_FMT = /^[0-9]{6}\.[0-9]{3}\.[0-9]{6}$/

const atomicWrite = (file, text) => {
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, text)
  fs.renameSync(tmp, file)
}

const QUERY = (after, indexDate) => {
  const arg = indexDate ? `after_index_date:"${indexDate}", ` : `after:${after}, `
  return `{ Plans(${arg}limit:200){
    id refEnstruCode plnPointYear refUnitsCode refSubjectTypeId indexDate
    RefEnstru{ code nameRu nameKz descRu descKz }
  } }`
}

async function main() {
  const started = Date.now()

  // ── состояние ──
  let state = null
  if (fs.existsSync(STATE)) state = JSON.parse(fs.readFileSync(STATE, 'utf8'))

  const head = await gql(QUERY(0), { tries: 4, timeoutMs: 60000 })
  const headRows = head.data?.Plans ?? []
  const currentMaxId = Math.max(...headRows.map((p) => p.id))
  const currentTopDate = headRows.map((p) => p.indexDate).sort().at(-1) ?? null

  const lastMaxId = state?.lastMaxPlanPointId ?? currentMaxId - CFG.lookbackIds
  const stopId = lastMaxId - CFG.overlapIds
  if (!state) {
    console.error(`[incremental] чекпоинта нет — первый запуск, глубина ${CFG.lookbackIds} id (stopId=${stopId})`)
  } else {
    console.error(`[incremental] с прошлого раза lastMaxId=${lastMaxId}, читаем до id≈${stopId} (overlap ${CFG.overlapIds})`)
  }

  // ── сбор ──
  const harvested = new Map() // code -> {nameRu,nameKz,descRu,descKz,years:Set,units:Set,subjectTypes:Set}
  let requests = 0
  let pointsScanned = 0
  let newestIndexDate = currentTopDate
  let usedIndexDate = false

  const ingest = (rows) => {
    for (const p of rows) {
      pointsScanned++
      if (p.indexDate && (!newestIndexDate || p.indexDate > newestIndexDate)) newestIndexDate = p.indexDate
      const ref = p.RefEnstru
      const code = (ref?.code || p.refEnstruCode || '').trim()
      if (!code || !CODE_FMT.test(code)) continue
      let e = harvested.get(code)
      if (!e) {
        e = { nameRu: (ref?.nameRu || '').trim(), nameKz: (ref?.nameKz || '').trim(), descRu: (ref?.descRu || '').trim(), descKz: (ref?.descKz || '').trim(), years: new Set(), units: new Set(), subjectTypes: new Set() }
        harvested.set(code, e)
      }
      if (p.plnPointYear) e.years.add(Number(p.plnPointYear))
      if (p.refUnitsCode != null && String(p.refUnitsCode).trim()) e.units.add(String(p.refUnitsCode).trim())
      if (p.refSubjectTypeId != null) e.subjectTypes.add(Number(p.refSubjectTypeId))
      if (!e.nameKz && ref?.nameKz) e.nameKz = ref.nameKz.trim()
      if (!e.descRu && ref?.descRu) e.descRu = ref.descRu.trim()
      if (!e.descKz && ref?.descKz) e.descKz = ref.descKz.trim()
    }
  }

  // быстрый путь: after_index_date (если попросили и он вдруг работает)
  if (CFG.tryIndexDate && state?.lastSuccessfulIndexDate) {
    try {
      let cursorDate = state.lastSuccessfulIndexDate
      for (let i = 0; i < CFG.maxRequests; i++) {
        const r = await gql(QUERY(0, cursorDate), { tries: 2, timeoutMs: 60000 })
        requests++
        const rows = r.data?.Plans ?? []
        ingest(rows)
        const li = r.extensions?.pageInfo?.lastIndexDate
        if (!r.extensions?.pageInfo?.hasNextPage || !rows.length || !li || li === cursorDate) break
        cursorDate = li
      }
      usedIndexDate = true
      console.error(`[incremental] after_index_date сработал: ${requests} запросов`)
    } catch (e) {
      console.error(`[incremental] after_index_date не сработал (${e.message}) → фолбэк на id-водораздел`)
      harvested.clear()
      requests = 0
      pointsScanned = 0
    }
  }

  // основной путь: id-водораздел, сверху вниз
  if (!usedIndexDate) {
    ingest(headRows)
    requests++
    let after = head.extensions?.pageInfo?.lastId ?? 0
    while (requests < CFG.maxRequests) {
      if (!after || after <= stopId) break
      const r = await gql(QUERY(after), { tries: 4, timeoutMs: 60000 })
      requests++
      const rows = r.data?.Plans ?? []
      ingest(rows)
      if (requests % 25 === 0) process.stderr.write(`  req ${requests} | points ${pointsScanned} | codes ${harvested.size} | after ${after}\n`)
      const pi = r.extensions?.pageInfo
      if (!pi?.hasNextPage || !rows.length) break
      if (pi.lastId === after) break
      after = pi.lastId
    }
  }

  // ── upsert в индекс ──
  const idxJson = JSON.parse(fs.readFileSync(IDX, 'utf8'))
  const rows = Array.isArray(idxJson) ? idxJson : idxJson.rows
  const byCode = new Map(rows.map((r) => [r.code, r]))

  let newKtru = 0
  let updatedKtru = 0
  for (const [code, h] of harvested) {
    const cur = byCode.get(code)
    if (!cur) {
      const row = {
        code,
        nameRu: h.nameRu,
        nameKz: h.nameKz,
        descExample: '',
        descRu: h.descRu,
        descKz: h.descKz,
        kpvedClass: code.slice(0, 6),
        kpvedGroup: code.slice(7, 10),
        kpvedPosition: code.slice(11),
        units: [...h.units].sort(),
        subjectTypes: [...h.subjectTypes].sort((a, b) => a - b),
        seenVia: ['goszakup:incremental'],
        years: [...h.years].sort(),
        planCount: 0,
        source: 'goszakup:incremental',
      }
      rows.push(row)
      byCode.set(code, row)
      newKtru++
      continue
    }
    let changed = false
    if ((!cur.nameKz || !cur.nameKz.trim()) && h.nameKz) { cur.nameKz = h.nameKz; changed = true }
    if ((cur.descRu === undefined || cur.descRu === '') && h.descRu) { cur.descRu = h.descRu; changed = true }
    if ((cur.descKz === undefined || cur.descKz === '') && h.descKz) { cur.descKz = h.descKz; changed = true }
    const yrs = new Set(cur.years || [])
    const before = yrs.size
    for (const y of h.years) yrs.add(y)
    if (yrs.size !== before) { cur.years = [...yrs].sort(); changed = true }
    if (changed) updatedKtru++
  }

  rows.sort((a, b) => a.code.localeCompare(b.code))

  const newMaxId = usedIndexDate ? (state?.lastMaxPlanPointId ?? currentMaxId) : Math.max(currentMaxId, lastMaxId)
  const elapsedSeconds = Math.round((Date.now() - started) / 1000)
  const runStats = {
    at: new Date().toISOString(),
    mode: usedIndexDate ? 'after_index_date' : 'id-watermark',
    planPoints: pointsScanned,
    requests,
    newKtru,
    updatedKtru,
    elapsedSeconds,
  }

  console.log('──────── ktru-harvest-incremental ────────')
  console.log('mode:            ', runStats.mode)
  console.log('PlnPoints:       ', pointsScanned)
  console.log('API requests:    ', requests)
  console.log('codes harvested: ', harvested.size)
  console.log('new KTRU:        ', newKtru)
  console.log('updated KTRU:    ', updatedKtru)
  console.log('index rows:      ', rows.length, `(было ${Array.isArray(idxJson) ? '?' : idxJson.count})`)
  console.log('elapsed:         ', elapsedSeconds + 's')

  if (CFG.dry) {
    console.log('\n[dry] запись пропущена')
    return
  }

  const body = Array.isArray(idxJson)
    ? rows
    : { ...idxJson, generated: new Date().toISOString(), count: rows.length, rows }
  atomicWrite(IDX, JSON.stringify(body, null, 1))

  const newState = {
    lastSuccessfulIndexDate: newestIndexDate || state?.lastSuccessfulIndexDate || null,
    lastMaxPlanPointId: newMaxId,
    updatedAt: new Date().toISOString(),
    lastRunStats: runStats,
    history: [...(state?.history ?? []), runStats].slice(-20),
  }
  atomicWrite(STATE, JSON.stringify(newState, null, 2))
  console.log('\nindex  →', CFG.index, (fs.statSync(IDX).size / 1024 / 1024).toFixed(2), 'MB')
  console.log('state  →', CFG.state, `(lastMaxId=${newMaxId}, date=${newState.lastSuccessfulIndexDate})`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

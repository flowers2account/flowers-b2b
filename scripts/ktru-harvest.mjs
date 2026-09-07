// Расширение локального КТРУ-индекса реальными кодами из живого Goszakup API.
//
//   node --env-file=.env.local scripts/ktru-harvest.mjs "Перчатки" "Маска" ...
//
// В Goszakup V3 НЕТ отдельного справочника ЕНС ТРУ — единственный источник
// настоящих кодов + названий это Plans (PlnPoint) c relation RefEnstru.
// Для каждого seed-термина: собираем позиции плана с nameRu == термин,
// извлекаем distinct refEnstruCode + RefEnstru{code,nameRu,nameKz,descRu,descKz},
// добираем точный planCount (totalCount) и наблюдаемые units/years/subjectTypes.
//
// Результат мержится в data/enstru/enstru_index.json (существующие строки не
// трогаются; коды-дубли не добавляются). НИКАКИХ придуманных кодов —
// в индекс попадает только то, что реально вернул API.

import fs from 'node:fs'
import path from 'node:path'
import { gql } from '../src/lib/goszakup/client.ts'

const IDX = path.join(process.cwd(), 'data', 'enstru', 'enstru_index.json')
const CODE_FMT = /^[0-9]{6}\.[0-9]{3}\.[0-9]{6}$/

const args = process.argv.slice(2)
const flags = new Set(args.filter((a) => a.startsWith('--')))
const perTermArg = args.find((a) => a.startsWith('--per='))
const perTerm = perTermArg ? parseInt(perTermArg.split('=')[1], 10) || 16 : 16
const seeds = args.filter((a) => !a.startsWith('--'))
if (!seeds.length) {
  console.error('Использование: node --env-file=.env.local scripts/ktru-harvest.mjs "Перчатки" ["Маска" ...] [--per=N] [--dry]')
  process.exit(1)
}

async function collect(term) {
  const seen = new Map()
  let after = 0
  for (let page = 0; page < 6; page++) {
    const r = await gql(
      `{ Plans(filter:{ nameRu:"${term.replace(/"/g, '\\"')}" }, limit:200, after:${after}){
        id refEnstruCode nameRu descRu extraDescRu refUnitsCode plnPointYear refSubjectTypeId
        RefEnstru{ code nameRu nameKz descRu descKz } } }`,
      { tries: 3, timeoutMs: 40000 },
    )
    const rows = r.data?.Plans ?? []
    for (const p of rows) {
      const code = p.refEnstruCode
      if (!code || !CODE_FMT.test(code)) continue
      const ref = p.RefEnstru ?? {}
      if (!seen.has(code)) {
        seen.set(code, {
          code,
          nameRu: (ref.nameRu ?? p.nameRu ?? '').trim(),
          nameKz: (ref.nameKz ?? '').trim(),
          descRu: (ref.descRu ?? '').trim(),
          descKz: (ref.descKz ?? '').trim(),
          units: new Set(),
          years: new Set(),
          subjectTypes: new Set(),
          samples: new Set(),
          seed: term,
        })
      }
      const e = seen.get(code)
      if (p.refUnitsCode) e.units.add(String(p.refUnitsCode))
      if (p.plnPointYear) e.years.add(Number(p.plnPointYear))
      if (p.refSubjectTypeId != null) e.subjectTypes.add(Number(p.refSubjectTypeId))
      const s = (p.descRu || p.extraDescRu || '').replace(/\s+/g, ' ').trim()
      if (s) e.samples.add(s.slice(0, 120))
    }
    const pi = r.extensions?.pageInfo
    if (!pi?.hasNextPage || !rows.length) break
    after = pi.lastId
  }
  return [...seen.values()]
}

async function exactPlanCount(code) {
  try {
    const r = await gql(`{ Plans(filter:{ refEnstruCode:"${code}" }, limit:1){ id } }`, { tries: 3, timeoutMs: 30000 })
    return r.extensions?.pageInfo?.totalCount ?? 0
  } catch {
    return 0
  }
}

const run = async () => {
  const idxJson = JSON.parse(fs.readFileSync(IDX, 'utf8'))
  const existing = Array.isArray(idxJson) ? idxJson : idxJson.rows
  const haveCodes = new Set(existing.map((r) => r.code))

  const collected = []
  for (const term of seeds) {
    process.stderr.write(`harvest "${term}"… `)
    const rows = (await collect(term)).filter((r) => r.nameRu)
    // ранжируем по числу наблюдений в выборке, берём top N новых
    const scored = []
    for (const r of rows) {
      const pc = await exactPlanCount(r.code)
      scored.push({ ...r, planCount: pc })
    }
    scored.sort((a, b) => b.planCount - a.planCount)
    const picked = scored.filter((r) => !haveCodes.has(r.code)).slice(0, perTerm)
    process.stderr.write(`${rows.length} distinct, +${picked.length} new\n`)
    for (const r of picked) {
      haveCodes.add(r.code)
      collected.push({
        code: r.code,
        nameRu: r.nameRu,
        nameKz: r.nameKz,
        descExample: [...r.samples][0] ?? r.descRu ?? '',
        descRu: r.descRu,
        descKz: r.descKz,
        kpvedClass: r.code.slice(0, 6),
        kpvedGroup: r.code.slice(7, 10),
        kpvedPosition: r.code.slice(11),
        units: [...r.units],
        subjectTypes: [...r.subjectTypes].sort(),
        seenVia: [r.seed],
        years: [...r.years].sort(),
        planCount: r.planCount,
        source: 'goszakup:harvest',
      })
    }
  }

  const merged = [...existing, ...collected].sort((a, b) => a.code.localeCompare(b.code))
  const out = {
    generated: new Date().toISOString(),
    source:
      'goszakup ows v3 GraphQL — Plans.PlnPoint + relation RefEnstru (authoritative code/nameRu/nameKz/descRu). ' +
      'Flower-domain rows harvested earlier; general rows via scripts/ktru-harvest.mjs seed terms.',
    disclaimer:
      'Partial index. Every code was returned by the live API for a real plan point — no synthetic codes. ' +
      'descRu/descKz come from RefEnstru; descExample is one buyer’s free text.',
    count: merged.length,
    rows: merged,
  }

  if (flags.has('--dry')) {
    console.log(JSON.stringify(collected, null, 1))
    console.error(`\n[dry] ${collected.length} new rows, merged total ${merged.length}`)
    return
  }
  fs.writeFileSync(IDX, JSON.stringify(out, null, 1))
  console.error(`written ${IDX}: ${existing.length} → ${merged.length} rows (+${collected.length})`)
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})

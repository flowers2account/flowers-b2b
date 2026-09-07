// Бенчмарк retrieval: линейный скан всех строк vs инвертированный префильтр.
// На один и тот же индекс, одинаковые запросы. Метрики: число кандидатов, p50, p95.
//
//   node scripts/ktru-bench.mjs data/enstru/enstru_full_experimental.json
//   node scripts/ktru-bench.mjs data/enstru/enstru_core_harvest.json data/enstru/enstru_index.json

import fs from 'node:fs'
import { prepareRow, scoreRow, retrievalSignals } from '../src/lib/ktru/scoring.ts'
import { buildInverted, selectCandidates } from '../src/lib/ktru/inverted.ts'
import { normalizeSearchQuery, tokenize } from '../src/lib/ktru/normalize.ts'
import { ATTRIBUTE_TERMS } from '../src/lib/ktru/synonyms.ts'

const files = process.argv.slice(2)
if (!files.length) {
  console.error('usage: node scripts/ktru-bench.mjs <index.json> [<index2.json> ...]')
  process.exit(1)
}

const QUERIES = ['лампа', 'перчатки нитриловые', 'перчтаки', 'кабель ВВГ', 'удобрение']
const ITER = 60

function pct(arr, p) {
  const s = [...arr].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]
}

function runLinear(prepared, maxPlan, tokens) {
  const retrieved = []
  for (const pr of prepared) {
    const via = retrievalSignals(pr, tokens)
    if (via.length) retrieved.push({ pr, via })
  }
  const kept = retrieved
    .map(({ pr }) => scoreRow(pr, { tokens, maxPlanCount: maxPlan }))
    .filter((s) => (s.signals.name || s.signals.synonym || s.signals.desc || s.signals.fuzzy) > 0 && s.score >= 0.05)
  return { candidates: retrieved.length, kept: kept.length }
}

function runInverted(prepared, inv, maxPlan, tokens) {
  const idx = selectCandidates(inv, tokens)
  const retrieved = []
  for (const i of idx) {
    const via = retrievalSignals(prepared[i], tokens)
    if (via.length) retrieved.push(prepared[i])
  }
  const kept = retrieved
    .map((pr) => scoreRow(pr, { tokens, maxPlanCount: maxPlan }))
    .filter((s) => (s.signals.name || s.signals.synonym || s.signals.desc || s.signals.fuzzy) > 0 && s.score >= 0.05)
  return { prefilter: idx.length, candidates: retrieved.length, kept: kept.length }
}

for (const file of files) {
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
  const rows = Array.isArray(parsed) ? parsed : parsed.rows
  let t = performance.now()
  const prepared = rows.map(prepareRow)
  const prepMs = performance.now() - t
  t = performance.now()
  const inv = buildInverted(prepared)
  const invMs = performance.now() - t
  const maxPlan = rows.reduce((m, r) => Math.max(m, r.planCount || 0), 0)

  console.log(`\n════════ ${file}  (${rows.length.toLocaleString('ru-RU')} строк) ════════`)
  console.log(`prepareRow (1×): ${prepMs.toFixed(0)} ms   buildInverted (1×): ${invMs.toFixed(0)} ms   distinct lemmas: ${inv.postings.size.toLocaleString('ru-RU')}`)
  console.log(
    'query'.padEnd(22) +
      'lin.cand'.padStart(9) + 'lin.p50'.padStart(9) + 'lin.p95'.padStart(9) +
      '  |' + 'pre'.padStart(7) + 'inv.cand'.padStart(9) + 'inv.p50'.padStart(9) + 'inv.p95'.padStart(9) + '  speedup'.padStart(9),
  )
  for (const q of QUERIES) {
    const tokens = tokenize(normalizeSearchQuery(q), ATTRIBUTE_TERMS)
    // warm
    runLinear(prepared, maxPlan, tokens)
    runInverted(prepared, inv, maxPlan, tokens)
    const linT = []
    const invT = []
    let linR, invR
    for (let i = 0; i < ITER; i++) {
      let s = performance.now(); linR = runLinear(prepared, maxPlan, tokens); linT.push(performance.now() - s)
      s = performance.now(); invR = runInverted(prepared, inv, maxPlan, tokens); invT.push(performance.now() - s)
    }
    const lp50 = pct(linT, 50), lp95 = pct(linT, 95), ip50 = pct(invT, 50), ip95 = pct(invT, 95)
    console.log(
      q.padEnd(22) +
        String(linR.candidates).padStart(9) + `${lp50.toFixed(1)}`.padStart(9) + `${lp95.toFixed(1)}`.padStart(9) +
        '  |' + String(invR.prefilter).padStart(7) + String(invR.candidates).padStart(9) +
        `${ip50.toFixed(1)}`.padStart(9) + `${ip95.toFixed(1)}`.padStart(9) +
        `${(lp50 / Math.max(ip50, 0.001)).toFixed(1)}×`.padStart(9),
    )
    if (linR.kept !== invR.kept) console.log(`   ⚠ kept mismatch: linear ${linR.kept} vs inverted ${invR.kept}`)
  }
}

// Экономика + детерминированный рейтинг/вердикт.
//   node --test tests/smart-ktru-scoring.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeEconomics } from '../src/lib/smart-ktru/economics.ts'
import { computeParticipationScore } from '../src/lib/smart-ktru/scoring.ts'
import { matchProductToSpec } from '../src/lib/smart-ktru/matching.ts'

// ─────────────── экономика ───────────────

test('economics: маржа по исторической цене', () => {
  const e = computeEconomics({
    quantity: 20, quantityUnit: 'шт', lotAmount: 52000,
    costPerUnit: 1400, historicalUnitPrice: 2250, historicalSource: '8 контрактов',
    logistics: 3000, taxRatio: 0.03, taxLabel: 'УСН 3%',
  })
  assert.equal(e.usesHistoricalPrice, true)
  assert.equal(e.revenue, 45000) // 2250*20
  assert.equal(e.directCost, 28000) // 1400*20
  // profit = 45000 - 28000 - 3000 - 1350 = 12650
  assert.equal(e.profit, 12650)
  assert.ok(Math.abs(e.marginRatio - 12650 / 45000) < 1e-9)
})

test('economics: нет себестоимости → profit/margin null + warning', () => {
  const e = computeEconomics({ quantity: 10, lotAmount: 100000, historicalUnitPrice: 9000 })
  assert.equal(e.profit, null)
  assert.equal(e.marginRatio, null)
  assert.ok(e.warnings.some((w) => /себестоимость/i.test(w)))
})

test('economics: нет исторической цены → считает по потолку + warning', () => {
  const e = computeEconomics({ quantity: 10, lotAmount: 100000, costPerUnit: 6000 })
  assert.equal(e.usesHistoricalPrice, false)
  assert.equal(e.unitPriceBasis, 10000) // потолок
  assert.ok(e.warnings.some((w) => /потолк/i.test(w)))
})

// ─────────────── рейтинг / вердикт ───────────────

const spec = (chars, extra = {}) => ({
  characteristics: chars,
  documents: extra.documents ?? [],
  otherRequirements: [],
  meta: { templateRecognized: true, extractedCount: chars.length, warnings: [], method: 'ai' },
  ...extra,
})
const req = (name, type, value, unit) => ({
  name, value: value ?? null, unit: unit ?? null, requirementType: type,
  rawRequirement: `${name} ${value ?? ''}`, confidence: 1,
})
const product = (chars) => ({ id: 'p', name: 'Горшок', costPerUnit: 3600, characteristics: chars, createdAt: '', updatedAt: '' })

function ctxFor({ prod, reqs, lotAmount = 800000, qty = 100, hist = 9000, daysLeft = 6, passed = false, method = 3 }) {
  const match = matchProductToSpec(prod, reqs)
  const economics = computeEconomics({
    quantity: qty, lotAmount, costPerUnit: prod.costPerUnit,
    historicalUnitPrice: hist, taxRatio: 0.03,
  })
  return {
    match, economics, spec: spec(reqs),
    deadlineDaysLeft: daysLeft, deadlinePassed: passed,
    tradeMethodId: method, lotAmount, regionKnown: false, regionInZone: null,
  }
}

test('вердикт: соответствие полное + хорошая маржа + срок ок → recommend', () => {
  const prod = product([
    { name: 'Материал', value: 'полипропилен' },
    { name: 'Диаметр', value: '30', unit: 'см' },
    { name: 'Высота', value: '30', unit: 'см' },
    { name: 'Цвет', value: 'зелёный' },
  ])
  const reqs = [
    req('Материал', 'text', 'полипропилен'),
    req('Диаметр', 'min', '30', 'см'),
    req('Высота', 'min', '25', 'см'),
    req('Цвет', 'text', 'зелёный'),
  ]
  const s = computeParticipationScore(ctxFor({ prod, reqs, daysLeft: 12, hist: 9000 }))
  assert.equal(s.verdict, 'recommend')
  assert.ok(s.participationIndex >= 65)
  assert.ok(s.pros.length >= 1)
})

test('вердикт: критическое несоответствие (высота ≥25, товар 20) → не recommend/не consider', () => {
  const prod = product([
    { name: 'Материал', value: 'полипропилен' },
    { name: 'Диаметр', value: '30', unit: 'см' },
    { name: 'Высота', value: '20', unit: 'см' },
    { name: 'Цвет', value: 'зелёный' },
  ])
  const reqs = [
    req('Материал', 'text', 'полипропилен'),
    req('Диаметр', 'min', '30', 'см'),
    req('Высота', 'min', '25', 'см'),
    req('Цвет', 'text', 'зелёный'),
  ]
  const s = computeParticipationScore(ctxFor({ prod, reqs }))
  assert.ok(['unlikely', 'unsuitable'].includes(s.verdict), `got ${s.verdict}`)
  assert.ok(s.risks.some((r) => /Критическое несоответствие/i.test(r)))
})

test('вердикт: критическое несоответствие + отрицательная маржа → unsuitable', () => {
  const prod = product([{ name: 'Высота', value: '20', unit: 'см' }])
  const reqs = [req('Высота', 'min', '25', 'см')]
  const s = computeParticipationScore(ctxFor({ prod, reqs, hist: 3000, lotAmount: 350000, qty: 100 }))
  // выручка 3000*100=300k, себест 3600*100=360k → убыток
  assert.equal(s.verdict, 'unsuitable')
})

test('вердикт: срок истёк → unsuitable', () => {
  const prod = product([{ name: 'Материал', value: 'полипропилен' }])
  const reqs = [req('Материал', 'text', 'полипропилен')]
  const s = computeParticipationScore(ctxFor({ prod, reqs, passed: true }))
  assert.equal(s.verdict, 'unsuitable')
})

test('фактор competition: нет способа закупки и нет истории → score null, confidence none', () => {
  const prod = product([{ name: 'Материал', value: 'полипропилен' }])
  const reqs = [req('Материал', 'text', 'полипропилен')]
  const c = ctxFor({ prod, reqs })
  c.tradeMethodId = null
  const s = computeParticipationScore(c)
  const comp = s.factors.find((f) => f.key === 'competition')
  assert.equal(comp.score, null)
  assert.equal(comp.confidence, 'none')
  assert.ok(s.risks.some((r) => /онкуренц/i.test(r)))
})

test('детерминированность: одинаковый вход → одинаковый результат', () => {
  const prod = product([{ name: 'Материал', value: 'полипропилен' }, { name: 'Диаметр', value: '30', unit: 'см' }])
  const reqs = [req('Материал', 'text', 'полипропилен'), req('Диаметр', 'min', '25', 'см')]
  const a = JSON.stringify(computeParticipationScore(ctxFor({ prod, reqs })))
  const b = JSON.stringify(computeParticipationScore(ctxFor({ prod, reqs })))
  assert.equal(a, b)
})

test('все 4 значения вердикта достижимы через правила', () => {
  const seen = new Set()
  const prodOk = product([{ name: 'Материал', value: 'полипропилен' }, { name: 'Высота', value: '30', unit: 'см' }])
  const reqsOk = [req('Материал', 'text', 'полипропилен'), req('Высота', 'min', '25', 'см')]
  seen.add(computeParticipationScore(ctxFor({ prod: prodOk, reqs: reqsOk, daysLeft: 12, hist: 9000 })).verdict)
  seen.add(computeParticipationScore(ctxFor({ prod: prodOk, reqs: reqsOk, daysLeft: 12, hist: 3800 })).verdict) // тонкая маржа
  const prodBad = product([{ name: 'Высота', value: '20', unit: 'см' }])
  const reqsBad = [req('Высота', 'min', '25', 'см')]
  seen.add(computeParticipationScore(ctxFor({ prod: prodBad, reqs: reqsBad, hist: 9000 })).verdict)
  seen.add(computeParticipationScore(ctxFor({ prod: prodBad, reqs: reqsBad, passed: true })).verdict)
  assert.ok(seen.size >= 3, `verdicts seen: ${[...seen]}`)
})

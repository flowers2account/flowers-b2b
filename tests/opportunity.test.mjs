// Тесты read-model «Opportunity»: агрегация AnalysisResult → OpportunitySummary.
// Используем РЕАЛЬНЫЕ детерминированные функции (matching/economics/scoring),
// чтобы проверить, что модель не подставляет фейковые значения.
//   node --test tests/opportunity.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matchProductToSpec } from '../src/lib/smart-ktru/matching.ts'
import { computeEconomics } from '../src/lib/smart-ktru/economics.ts'
import { computeParticipationScore } from '../src/lib/smart-ktru/scoring.ts'
import {
  opportunityFromAnalysis,
  opportunityFromLot,
  isAnalysisStale,
} from '../src/lib/smart-ktru/opportunity.ts'
import { toProfileCharacteristics } from '../src/lib/smart-ktru/product-profile.ts'

// ── фикстуры ──
const facts = {
  lotId: 111, lotNumber: 'L-1', buyId: 222, buyNumberAnno: 'B-1',
  nameRu: 'Горшок', descriptionRu: 'пластиковый', amount: 300000, count: 100,
  customerBin: '1', customerNameRu: 'Школа №1', refLotStatusId: 1, statusLabel: 'приём заявок',
  tradeMethodId: 3, tradeMethodLabel: 'запрос ценовых предложений',
  kato: '751110000', regionLabel: 'г. Астана', publishDate: '2026-01-01', endDate: '2026-02-01',
  deadlineDaysLeft: 10, deadlinePassed: false, specFile: null,
}

function req(name, value, unit, requirementType, raw, source) {
  return { name, value, unit: unit ?? null, requirementType, rawRequirement: raw ?? `${name}: ${value ?? ''}`, source: source ?? undefined }
}

function makeAnalysis({ product, reqs, historicalUnitPrice = null }) {
  const spec = { productName: null, characteristics: reqs, quantity: { value: facts.count }, delivery: {}, documents: [], otherRequirements: [], meta: { templateRecognized: true, extractedCount: reqs.length, warnings: [], method: 'ai' } }
  const match = matchProductToSpec(product, reqs)
  const economics = computeEconomics({
    quantity: facts.count, quantityUnit: 'шт', lotAmount: facts.amount,
    costPerUnit: product.costPerUnit ?? null, historicalUnitPrice,
    taxRatio: 0.03, taxLabel: 'УСН 3%',
  })
  const score = computeParticipationScore({
    match, economics, spec, deadlineDaysLeft: facts.deadlineDaysLeft, deadlinePassed: facts.deadlinePassed,
    tradeMethodId: facts.tradeMethodId, lotAmount: facts.amount, regionKnown: true, regionInZone: null,
  })
  return { productId: product.id, productName: product.name, facts, spec, specText: 'текст ТС', match, economics, score, generatedAt: '2026-01-10T00:00:00.000Z', warnings: [] }
}

const P = (chars, cost = 125) => ({
  id: 'p1', name: 'Горшок пластиковый', category: 'Горшки', costPerUnit: cost, saleUnit: 'шт',
  ktru: [{ code: '222929.900.000114', role: 'primary', source: 'system', createdAt: '2026-01-01', updatedAt: '2026-01-01' }],
  characteristics: toProfileCharacteristics(chars),
  createdAt: '2026-01-01', updatedAt: '2026-01-05',
})

test('7 — нет анализа: opportunityFromLot → state not-analyzed, intelligence = null', () => {
  const o = opportunityFromLot({ lotId: 42, nameRu: 'Грунт', customerNameRu: 'ГКП', amount: 50000, count: 20, ktru: '081212.119.000010', deadlineDaysLeft: 3 })
  assert.equal(o.state, 'not-analyzed')
  assert.equal(o.compatibility, null)
  assert.equal(o.economics, null)
  assert.equal(o.decision, null)
  assert.equal(o.title, 'Грунт')
  assert.equal(o.procurementPrice, 50000)
  assert.equal(o.ktruCode, '081212.119.000010')
})

test('1 — все требования match: compatibilityPercent 100, mismatch/pending = 0', () => {
  const product = P([
    { name: 'Материал', value: 'пластик', fromAi: true },
    { name: 'Цвет', value: 'белый', fromAi: true },
  ])
  const reqs = [
    req('Материал', 'пластик', null, 'text', 'материал: пластик'),
    req('Цвет', 'белый', null, 'text', 'цвет: белый'),
  ]
  const o = opportunityFromAnalysis(makeAnalysis({ product, reqs }), '222929.900.000114')
  assert.equal(o.compatibility.matched, 2)
  assert.equal(o.compatibility.mismatched, 0)
  assert.equal(o.compatibility.pending, 0)
  assert.equal(o.compatibility.compatibilityPercent, 100)
  assert.equal(o.ktruCode, '222929.900.000114')
})

test('2 + 6 — mismatch по объёму + нет исторической цены', () => {
  const product = P([
    { name: 'Материал', value: 'пластик', fromAi: true },
    { name: 'Объём', value: '2.5', unit: 'л', fromAi: true },
  ])
  const reqs = [
    req('Материал', 'пластик', null, 'text', 'материал: пластик'),
    req('Объём', '5', 'л', 'exact', 'объём 5 л'),
  ]
  const o = opportunityFromAnalysis(makeAnalysis({ product, reqs }), 'k')
  assert.ok(o.compatibility.mismatched >= 1)
  assert.ok(o.compatibility.compatibilityPercent < 100)
  const vol = o.compatibility.rows.find((r) => r.name === 'Объём')
  assert.equal(vol.result, 'mismatch')
  assert.equal(vol.needed, '5 л')
  assert.equal(vol.have, '2.5 л')
  assert.equal(o.economics.usesHistoricalPrice, false)
  assert.equal(o.economics.historicalMedian, null)
})

test('3 — pending: пустая характеристика → «Требует проверки», НЕ в знаменателе %', () => {
  const product = P([
    { name: 'Материал', value: 'пластик', fromAi: true },
    { name: 'Цвет', value: '', fromAi: true }, // пусто → pending
  ])
  const reqs = [
    req('Материал', 'пластик', null, 'text', 'материал: пластик'),
    req('Цвет', 'белый', null, 'text', 'цвет: белый'),
  ]
  const o = opportunityFromAnalysis(makeAnalysis({ product, reqs }), 'k')
  const color = o.compatibility.rows.find((r) => r.name === 'Цвет')
  assert.equal(color.result, 'pending')
  assert.equal(color.resultLabel, 'Требует проверки')
  assert.equal(color.have, 'нет данных')
  // 1 match, 0 mismatch, 1 pending → 1/1 сравнимых = 100%
  assert.equal(o.compatibility.pending, 1)
  assert.equal(o.compatibility.compatibilityPercent, 100)
})

test('4 + 8 — critical mismatch: hasCriticalMismatch, verdict НЕ recommend', () => {
  const product = P([
    { name: 'Материал', value: 'пластик', fromAi: true },
    { name: 'Высота', value: '10', unit: 'см', fromAi: true },
  ])
  const reqs = [
    req('Материал', 'пластик', null, 'text', 'материал: пластик'),
    req('Высота', '25', 'см', 'min', 'высота не менее 25 см'), // 10 < 25 → критический mismatch
  ]
  const o = opportunityFromAnalysis(makeAnalysis({ product, reqs }), 'k')
  assert.equal(o.compatibility.critical, 1)
  assert.equal(o.decision.hasCriticalMismatch, true)
  assert.notEqual(o.decision.verdict, 'recommend')
})

test('5 + 10 — нет себестоимости: economics.available=false, без фейковых 0', () => {
  const product = { id: 'p2', name: 'Горшок', characteristics: toProfileCharacteristics([{ name: 'Материал', value: 'пластик', fromAi: true }]), createdAt: '2026-01-01', updatedAt: '2026-01-01' }
  const reqs = [req('Материал', 'пластик', null, 'text', 'материал: пластик')]
  const o = opportunityFromAnalysis(makeAnalysis({ product, reqs }), 'k')
  assert.equal(o.economics.available, false)
  assert.match(o.economics.unavailableReason, /себестоимост/i)
  assert.equal(o.economics.grossProfit, null)
  assert.equal(o.economics.marginPercent, null)
  assert.equal(o.economics.productCost, null)
  // выручка может быть (цена×кол-во), но прибыль/маржа — строго null, не 0
  assert.notEqual(o.economics.grossProfit, 0)
})

test('8 — хорошая экономика + всё match: verdict recommend', () => {
  const product = P([{ name: 'Материал', value: 'пластик', fromAi: true }], 50) // низкая себестоимость → высокая маржа
  const reqs = [req('Материал', 'пластик', null, 'text', 'материал: пластик')]
  const o = opportunityFromAnalysis(makeAnalysis({ product, reqs, historicalUnitPrice: 2500 }), 'k')
  assert.equal(o.economics.available, true)
  assert.ok(o.economics.marginPercent > 25)
  assert.equal(o.decision.verdict, 'recommend')
})

test('9 — Product Profile как источник: productValue берётся из characteristics, не из ТЗ', () => {
  const product = P([{ name: 'Материал', value: 'полипропилен', fromAi: true }]) // товар: полипропилен
  const reqs = [req('Материал', 'пластик', null, 'text', 'материал: пластик')]
  const o = opportunityFromAnalysis(makeAnalysis({ product, reqs }), 'k')
  const mat = o.compatibility.rows.find((r) => r.name === 'Материал')
  assert.equal(mat.productValue, 'полипропилен') // значение товара, а не «пластик» из требования
  assert.equal(mat.result, 'match') // полипропилен ⊂ пластик (синоним в matching)
})

test('source: фрагмент текста ТЗ пробрасывается, номер страницы не выдумывается', () => {
  const product = P([{ name: 'Материал', value: 'керамика', fromAi: true }])
  const reqs = [req('Материал', 'пластик', null, 'text', 'материал: пластик', { text: 'Материал: пластик' })]
  const o = opportunityFromAnalysis(makeAnalysis({ product, reqs }), 'k')
  const mat = o.compatibility.rows.find((r) => r.name === 'Материал')
  assert.equal(mat.source.text, 'Материал: пластик')
  assert.ok(mat.source.page === undefined)
})

test('isAnalysisStale: профиль изменён после анализа', () => {
  assert.equal(isAnalysisStale('2026-01-10T00:00:00Z', '2026-01-12T00:00:00Z'), true)
  assert.equal(isAnalysisStale('2026-01-10T00:00:00Z', '2026-01-05T00:00:00Z'), false)
  assert.equal(isAnalysisStale(null, '2026-01-12T00:00:00Z'), false)
})

test('детерминированность модели', () => {
  const product = P([{ name: 'Материал', value: 'пластик', fromAi: true }])
  const reqs = [req('Материал', 'пластик', null, 'text', 'материал: пластик')]
  const a = makeAnalysis({ product, reqs })
  assert.equal(JSON.stringify(opportunityFromAnalysis(a, 'k')), JSON.stringify(opportunityFromAnalysis(a, 'k')))
})

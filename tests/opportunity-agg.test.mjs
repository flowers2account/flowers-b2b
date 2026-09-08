// Дедупликация закупок: одна закупка = один ProcurementOpportunity с N товарами.
//   node --test tests/opportunity-agg.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aggregateOpportunities, scoreOpportunity, textMatch } from '../src/lib/smart-ktru/opportunity-agg.ts'

const lot = (id, name = 'Поставка горшков для растений') => ({
  lotId: id, buyId: id * 10, nameRu: name, amount: 300000, count: 100,
  customerNameRu: 'Школа №1', region: 'г. Астана', endDate: '2026-03-01',
  deadlineDaysLeft: 10, deadlinePassed: false, trdBuyNumberAnno: `A-${id}`,
})
const GEN = '2026-02-01T00:00:00.000Z'

test('DoD#11 — 1 закупка + 1 товар = 1 opportunity, 1 matched product', () => {
  const opps = aggregateOpportunities(
    [{ code: '222929.900.000114', role: 'primary', origin: 'product', productIds: ['p1'], lots: [lot(1)] }],
    [{ id: 'p1', name: 'Горшок 20 см' }],
    { generatedAt: GEN },
  )
  assert.equal(opps.length, 1)
  assert.equal(opps[0].lotId, 1)
  assert.deepEqual(opps[0].matchedProductIds, ['p1'])
  assert.deepEqual(opps[0].matchReasons, ['primary_ktru_match'])
  assert.equal(opps[0].matchScore, 0.95)
})

test('DoD#12/#13 — 1 закупка + 60 товаров = ОДНА opportunity с 60 товарами', () => {
  const products = Array.from({ length: 60 }, (_, i) => ({ id: `p${i}`, name: `Горшок ${10 + i} см`, groupId: 'g1' }))
  const opps = aggregateOpportunities(
    [{ code: '236919.900.000010', role: 'alternative', origin: 'group', productIds: products.map((p) => p.id), lots: [lot(42)] }],
    products,
    { generatedAt: GEN },
  )
  assert.equal(opps.length, 1) // НЕ 60 карточек
  assert.equal(opps[0].matchedProductIds.length, 60)
  assert.deepEqual(opps[0].matchedProductGroupIds, ['g1'])
  assert.deepEqual(opps[0].matchReasons, ['group_alternative_ktru_match'])
  assert.equal(opps[0].matchScore, 0.75)
})

test('DoD#14/#15 — primary + alternative по одной закупке → ОДНА карточка, несколько reasons, пара procurement+product один раз', () => {
  const opps = aggregateOpportunities(
    [
      { code: 'C1', role: 'primary', origin: 'product', productIds: ['p1'], lots: [lot(7)] },
      { code: 'C2', role: 'alternative', origin: 'product', productIds: ['p1', 'p2'], lots: [lot(7)] },
    ],
    [{ id: 'p1', name: 'Горшок А' }, { id: 'p2', name: 'Горшок Б' }],
    { generatedAt: GEN },
  )
  assert.equal(opps.length, 1)
  assert.deepEqual(opps[0].matchedProductIds.sort(), ['p1', 'p2'])
  assert.deepEqual(opps[0].procurementKtruCodes.sort(), ['C1', 'C2'])
  assert.equal(opps[0].matchedKtru.length, 2)
  // p1 учтён один раз, хотя пришёл и по C1, и по C2
  assert.equal(opps[0].matchedProductIds.filter((x) => x === 'p1').length, 1)
  assert.ok(opps[0].matchReasons.includes('primary_ktru_match'))
  assert.ok(opps[0].matchReasons.includes('alternative_ktru_match'))
  assert.equal(opps[0].matchScore, 0.95) // max(primary/product, alternative/product)
})

test('DoD#16 — совпадение по нескольким КТРУ не создаёт несколько procurement cards', () => {
  const codes = ['A', 'B', 'C'].map((c) => ({
    code: c, role: 'alternative', origin: 'group', productIds: ['p1'], lots: [lot(99)],
  }))
  const opps = aggregateOpportunities(codes, [{ id: 'p1', name: 'Горшок' }], { generatedAt: GEN })
  assert.equal(opps.length, 1)
  assert.equal(opps[0].matchedKtru.length, 3)
})

test('несколько разных закупок → несколько opportunity, каждая уникальна по lotId', () => {
  const opps = aggregateOpportunities(
    [{ code: 'C', role: 'primary', origin: 'product', productIds: ['p1'], lots: [lot(1), lot(2), lot(3)] }],
    [{ id: 'p1', name: 'Горшок' }],
    { generatedAt: GEN },
  )
  assert.equal(opps.length, 3)
  assert.deepEqual(opps.map((o) => o.lotId).sort(), [1, 2, 3])
})

test('#19 — text_match: товар без КТРУ-совпадения подтягивается к закупке по названию', () => {
  const opps = aggregateOpportunities(
    [{ code: 'C', role: 'primary', origin: 'product', productIds: ['p1'], lots: [lot(5, 'Закупка пластиковых горшков для комнатных растений')] }],
    [
      { id: 'p1', name: 'Горшок пластиковый' },
      { id: 'p2', name: 'Пластиковый горшок для комнатных растений 20 см' }, // КТРУ не совпал, но название — да
      { id: 'p3', name: 'Лопата садовая' }, // не относится
    ],
    { generatedAt: GEN },
  )
  assert.equal(opps.length, 1)
  assert.ok(opps[0].matchedProductIds.includes('p1'))
  assert.ok(opps[0].matchedProductIds.includes('p2'))
  assert.ok(!opps[0].matchedProductIds.includes('p3'))
  assert.ok(opps[0].matchReasons.includes('text_match'))
})

test('textMatch — ≥2 общих значимых токена', () => {
  assert.equal(textMatch('Поставка пластиковых горшков', 'Горшок пластиковый для цветов'), true)
  assert.equal(textMatch('Поставка канцелярских товаров', 'Горшок пластиковый'), false)
  assert.equal(textMatch(null, 'Горшок'), false)
})

test('scoreOpportunity — веса и порядок reasons', () => {
  assert.deepEqual(scoreOpportunity([{ role: 'primary', origin: 'product' }], false), { score: 0.95, reasons: ['primary_ktru_match'] })
  assert.deepEqual(scoreOpportunity([{ role: 'alternative', origin: 'group' }], false), { score: 0.75, reasons: ['group_alternative_ktru_match'] })
  assert.deepEqual(scoreOpportunity([], true), { score: 0.55, reasons: ['text_match'] })
  const mixed = scoreOpportunity([{ role: 'alternative', origin: 'group' }, { role: 'primary', origin: 'product' }], true)
  assert.equal(mixed.score, 0.95)
  assert.deepEqual(mixed.reasons, ['primary_ktru_match', 'group_alternative_ktru_match', 'text_match'])
})

test('детерминированность — одинаковый вход → одинаковый выход', () => {
  const inp = [{ code: 'C', role: 'primary', origin: 'product', productIds: ['p1', 'p0'], lots: [lot(1)] }]
  const pr = [{ id: 'p0', name: 'Б' }, { id: 'p1', name: 'А' }]
  const a = JSON.stringify(aggregateOpportunities(inp, pr, { generatedAt: GEN }))
  const b = JSON.stringify(aggregateOpportunities(inp, pr, { generatedAt: GEN }))
  assert.equal(a, b)
  // товары отсортированы по имени
  assert.deepEqual(JSON.parse(a)[0].matchedProductIds, ['p1', 'p0'])
})

test('прод-сценарий §30.9 — 60 products → 1 group → 2 KTRU → 1 procurement по alt → 1 opportunity / 60 товаров', () => {
  const products = Array.from({ length: 60 }, (_, i) => ({ id: `sku${i}`, name: `Горшок ${10 + i} см`, groupId: 'grp' }))
  const fetched = [
    // primary 222929.900.000114 — закупок не вернул
    { code: '222929.900.000114', role: 'primary', origin: 'group', productIds: products.map((p) => p.id), lots: [] },
    // alternative 236919.900.000010 — вернул 1 лот
    { code: '236919.900.000010', role: 'alternative', origin: 'group', productIds: products.map((p) => p.id), lots: [lot(500, 'Поставка горшков для растений')] },
  ]
  const opps = aggregateOpportunities(fetched, products, { generatedAt: GEN })
  assert.equal(opps.length, 1)
  assert.equal(opps[0].lotId, 500)
  assert.equal(opps[0].matchedProductIds.length, 60)
  assert.deepEqual(opps[0].matchedProductGroupIds, ['grp'])
  assert.ok(opps[0].matchReasons.includes('group_alternative_ktru_match'))
  assert.equal(opps[0].matchScore, 0.75)
})

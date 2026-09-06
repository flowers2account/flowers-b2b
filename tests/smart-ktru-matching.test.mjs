// Детерминированное сопоставление товара с требованиями ТС.
//   node --test tests/smart-ktru-matching.test.mjs
// Ключевое: тип ограничения решает вердикт (≥25 / товар 20 → НЕ соответствует).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matchProductToSpec, matchRequirement, parseConstraint } from '../src/lib/smart-ktru/matching.ts'

const product = (chars) => ({
  id: 'p1', name: 'Тест', characteristics: chars, createdAt: '', updatedAt: '',
})
const req = (o) => ({ name: o.name, value: o.value ?? null, unit: o.unit ?? null, requirementType: o.type, rawRequirement: o.raw ?? o.value ?? '', confidence: 1 })
const v = (p, r) => matchRequirement(p, r).verdict

test('min: ТС ≥25, товар 30 → match', () => {
  assert.equal(v(product([{ name: 'Высота', value: '30', unit: 'см' }]),
    req({ name: 'Высота', type: 'min', value: '25', unit: 'см', raw: 'не менее 25 см' })), 'match')
})

test('min: ТС ≥25, товар 20 → mismatch (и критично)', () => {
  const row = matchRequirement(
    product([{ name: 'Высота', value: '20', unit: 'см' }]),
    req({ name: 'Высота', type: 'min', value: '25', unit: 'см', raw: 'высота не менее 25 см' }),
  )
  assert.equal(row.verdict, 'mismatch')
  assert.equal(row.critical, true)
})

test('max: ТС ≤25, товар 30 → mismatch', () => {
  assert.equal(v(product([{ name: 'Высота', value: '30', unit: 'см' }]),
    req({ name: 'Высота', type: 'max', value: '25', unit: 'см', raw: 'не более 25 см' })), 'mismatch')
})
test('max: ТС ≤25, товар 20 → match', () => {
  assert.equal(v(product([{ name: 'Высота', value: '20', unit: 'см' }]),
    req({ name: 'Высота', type: 'max', value: '25', unit: 'см', raw: 'не более 25 см' })), 'match')
})

test('range: ТС 20–30, товар 25 → match; товар 35 → mismatch', () => {
  assert.equal(v(product([{ name: 'Диаметр', value: '25', unit: 'см' }]),
    req({ name: 'Диаметр', type: 'range', value: '20-30', unit: 'см', raw: 'от 20 до 30 см' })), 'match')
  assert.equal(v(product([{ name: 'Диаметр', value: '35', unit: 'см' }]),
    req({ name: 'Диаметр', type: 'range', value: '20-30', unit: 'см', raw: '20-30 см' })), 'mismatch')
})

test('exact число: ТС 30, товар 30 → match; товар 28 → mismatch', () => {
  assert.equal(v(product([{ name: 'Диаметр', value: '30', unit: 'см' }]),
    req({ name: 'Диаметр', type: 'exact', value: '30', unit: 'см', raw: 'диаметр 30 см' })), 'match')
  assert.equal(v(product([{ name: 'Диаметр', value: '28', unit: 'см' }]),
    req({ name: 'Диаметр', type: 'exact', value: '30', unit: 'см', raw: 'диаметр 30 см' })), 'mismatch')
})

test('единицы: ТС ≥250 мм, товар 30 см → match (нормализация)', () => {
  assert.equal(v(product([{ name: 'Высота', value: '30', unit: 'см' }]),
    req({ name: 'Высота', type: 'min', value: '250', unit: 'мм', raw: 'не менее 250 мм' })), 'match')
})

test('text/из списка: ТС «полипропилен», товар «ПП» → match (синоним)', () => {
  assert.equal(v(product([{ name: 'Материал', value: 'ПП' }]),
    req({ name: 'Материал', type: 'text', value: 'полипропилен', raw: 'материал: полипропилен' })), 'match')
})
test('text: ТС «зелёный», товар «синий» → mismatch', () => {
  assert.equal(v(product([{ name: 'Цвет', value: 'синий' }]),
    req({ name: 'Цвет', type: 'text', value: 'зелёный', raw: 'цвет зелёный' })), 'mismatch')
})
test('из списка: ТС «пластик или полипропилен», товар «полипропилен» → match', () => {
  assert.equal(v(product([{ name: 'Материал', value: 'полипропилен' }]),
    req({ name: 'Материал', type: 'text', value: 'пластик или полипропилен', raw: 'пластик или полипропилен' })), 'match')
})

test('document: нет данных в товаре → pending (не match и не mismatch)', () => {
  assert.equal(v(product([{ name: 'Материал', value: 'ПП' }]),
    req({ name: 'Сертификат соответствия', type: 'document', value: 'сертификат соответствия', raw: 'наличие сертификата соответствия' })), 'pending')
})
test('document: товар отмечен «Сертификат соответствия: да» → match', () => {
  assert.equal(v(product([{ name: 'Сертификат соответствия', value: 'да' }]),
    req({ name: 'Сертификат соответствия', type: 'document', value: 'сертификат соответствия', raw: 'наличие сертификата' })), 'match')
})

test('нет характеристики у товара → pending', () => {
  assert.equal(v(product([{ name: 'Материал', value: 'ПП' }]),
    req({ name: 'Плотность', type: 'min', value: '0.9', unit: 'г/см3', raw: 'плотность не менее 0,9' })), 'pending')
})

test('parseConstraint: разные формулировки', () => {
  assert.deepEqual(parseConstraint('не менее 25 см', 'min'), { kind: 'min', a: 25 })
  assert.deepEqual(parseConstraint('≥ 70%', 'min'), { kind: 'min', a: 70 })
  assert.deepEqual(parseConstraint('до 25 см', 'max'), { kind: 'max', a: 25 })
  assert.deepEqual(parseConstraint('20-30', 'range'), { kind: 'range', a: 20, b: 30 })
  assert.deepEqual(parseConstraint('от 20 до 30 см', 'range'), { kind: 'range', a: 20, b: 30 })
})

test('агрегат matchProductToSpec: считает mismatched/critical и сортирует mismatch наверх', () => {
  const p = product([
    { name: 'Материал', value: 'ПП' },
    { name: 'Диаметр', value: '30', unit: 'см' },
    { name: 'Высота', value: '20', unit: 'см' },
    { name: 'Цвет', value: 'зелёный' },
  ])
  const reqs = [
    req({ name: 'Материал', type: 'text', value: 'полипропилен', raw: 'полипропилен' }),
    req({ name: 'Диаметр', type: 'min', value: '30', unit: 'см', raw: 'не менее 30 см' }),
    req({ name: 'Высота', type: 'min', value: '25', unit: 'см', raw: 'не менее 25 см' }),
    req({ name: 'Цвет', type: 'text', value: 'зелёный', raw: 'зелёный' }),
  ]
  const res = matchProductToSpec(p, reqs)
  assert.equal(res.matched, 3)
  assert.equal(res.mismatched, 1)
  assert.equal(res.criticalMismatches, 1)
  assert.equal(res.rows[0].verdict, 'mismatch') // критичный наверху
  assert.equal(res.rows[0].requirement.name, 'Высота')
  assert.ok(Math.abs(res.ratio - 0.75) < 1e-9)
})

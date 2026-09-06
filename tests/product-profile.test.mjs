// Тесты Product Profile: сборка characteristics из формы, source/verified,
// пустые значения, provenance, round-trip при повторном входе, совместимость с matching.
//   node --test tests/product-profile.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  toProfileCharacteristics,
  profileToRows,
  countFilled,
} from '../src/lib/smart-ktru/product-profile.ts'
import { matchProductToSpec } from '../src/lib/smart-ktru/matching.ts'

const byName = (arr, n) => arr.find((c) => c.name === n)

test('AI-характеристика с введённым значением → source:ai, verified:true, provenance сохранён', () => {
  const out = toProfileCharacteristics([
    { name: 'Материал', value: 'Пластик ABS', unit: '', fromAi: true, confidence: 1, frequency: 13, totalSpecs: 13, examples: ['пластик', 'керамика'] },
  ])
  const m = byName(out, 'Материал')
  assert.equal(m.value, 'Пластик ABS')
  assert.equal(m.source, 'ai')
  assert.equal(m.verified, true)
  assert.equal(m.confidence, 1)
  assert.equal(m.frequency, 13)
  assert.equal(m.totalSpecs, 13)
  assert.deepEqual(m.examples, ['пластик', 'керамика'])
})

test('AI-характеристика без значения сохраняется (пустое допустимо), verified:false, значение не пишется', () => {
  const out = toProfileCharacteristics([
    { name: 'Объём', value: '', fromAi: true, frequency: 13, totalSpecs: 13 },
  ])
  assert.equal(out.length, 1)
  const o = byName(out, 'Объём')
  assert.equal(o.verified, false)
  assert.ok(!('value' in o) || o.value === undefined)
  assert.equal(o.frequency, 13) // provenance остаётся даже без значения
})

test('ручная характеристика → source:user, без искусственного confidence/frequency', () => {
  const out = toProfileCharacteristics([
    { name: 'Гарантия', value: '12 мес', fromAi: false },
  ])
  const g = byName(out, 'Гарантия')
  assert.equal(g.source, 'user')
  assert.equal(g.verified, true)
  assert.ok(g.confidence === undefined)
  assert.ok(g.frequency === undefined)
  assert.ok(g.examples === undefined)
})

test('строки без имени отбрасываются (удаление/пустой ряд)', () => {
  const out = toProfileCharacteristics([
    { name: '', value: 'что-то' },
    { name: '   ', value: 'x' },
    { name: 'Цвет', value: 'белый', fromAi: true },
  ])
  assert.deepEqual(out.map((c) => c.name), ['Цвет'])
})

test('удаление характеристики = её просто нет во входе → нет в профиле', () => {
  const rows = [
    { name: 'Материал', value: 'пластик', fromAi: true },
    { name: 'Цвет', value: 'белый', fromAi: true },
  ]
  const afterDelete = rows.filter((r) => r.name !== 'Цвет')
  const out = toProfileCharacteristics(afterDelete)
  assert.deepEqual(out.map((c) => c.name), ['Материал'])
})

test('round-trip: сохранил → открыл заново → значения и provenance на месте, verified не сбрасывается', () => {
  const saved = toProfileCharacteristics([
    { name: 'Материал', value: 'Пластик', fromAi: true, confidence: 1, frequency: 13, totalSpecs: 13, examples: ['пластик'] },
    { name: 'Цвет', value: '', fromAi: true, frequency: 10, totalSpecs: 13 },
    { name: 'Гарантия', value: '1 год', fromAi: false },
  ])
  const reopened = toProfileCharacteristics(profileToRows(saved))
  assert.deepEqual(reopened, saved) // идемпотентность round-trip
  const mat = byName(reopened, 'Материал')
  assert.equal(mat.value, 'Пластик')
  assert.equal(mat.verified, true)
  assert.equal(mat.frequency, 13)
  assert.equal(byName(reopened, 'Гарантия').source, 'user')
})

test('countFilled: заполнено vs всего', () => {
  const chars = toProfileCharacteristics([
    { name: 'A', value: 'x', fromAi: true },
    { name: 'B', value: '', fromAi: true },
    { name: 'C', value: 'y', fromAi: false },
  ])
  assert.deepEqual(countFilled(chars), { filled: 2, total: 3 })
})

test('matching принимает сохранённый Product Profile (лишние поля не мешают)', () => {
  const characteristics = toProfileCharacteristics([
    { name: 'Материал', value: 'пластик', fromAi: true, confidence: 1, frequency: 13, totalSpecs: 13, examples: ['пластик'] },
    { name: 'Диаметр', value: '20', unit: 'см', fromAi: true, confidence: 0.3, frequency: 3, totalSpecs: 13 },
    { name: 'Высота', value: '', fromAi: true, frequency: 4, totalSpecs: 13 }, // пустое → pending
  ])
  const product = {
    id: 'p1', name: 'Горшок', characteristics,
    createdAt: '2026-01-01', updatedAt: '2026-01-01',
  }
  const reqs = [
    { name: 'Материал', value: 'пластик', unit: null, requirementType: 'text', rawRequirement: 'материал: пластик' },
    { name: 'Диаметр', value: '20', unit: 'см', requirementType: 'exact', rawRequirement: 'диаметр 20 см' },
    { name: 'Высота', value: '25', unit: 'см', requirementType: 'min', rawRequirement: 'высота не менее 25 см' },
  ]
  const res = matchProductToSpec(product, reqs)
  assert.equal(res.total, 3)
  const mat = res.rows.find((r) => r.requirement.name === 'Материал')
  const dia = res.rows.find((r) => r.requirement.name === 'Диаметр')
  const hei = res.rows.find((r) => r.requirement.name === 'Высота')
  assert.equal(mat.verdict, 'match')
  assert.equal(dia.verdict, 'match')
  assert.equal(hei.verdict, 'pending') // значение не заполнено → «нет данных»
})

test('изменение значения не возвращается к пустому при повторной сборке', () => {
  let rows = profileToRows(toProfileCharacteristics([
    { name: 'Материал', value: '', fromAi: true, frequency: 13, totalSpecs: 13 },
  ]))
  rows = rows.map((r) => (r.name === 'Материал' ? { ...r, value: 'ABS' } : r))
  const out = toProfileCharacteristics(rows)
  assert.equal(byName(out, 'Материал').value, 'ABS')
  assert.equal(byName(out, 'Материал').verified, true)
})

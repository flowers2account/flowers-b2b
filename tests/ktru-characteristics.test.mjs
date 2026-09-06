// Тесты агрегации характеристик по КТРУ (чистые функции, без сети/AI).
//   node --test tests/ktru-characteristics.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeCharName,
  aggregateCharacteristics,
} from '../src/lib/smart-ktru/ktru-characteristics.ts'

const names = (rows) => rows.map((r) => r.name)
const byName = (rows, n) => rows.find((r) => r.name === n)

test('normalizeCharName: разные формулировки → одно имя', () => {
  for (const v of ['Материал', 'материал изготовления', 'Материал корпуса', 'Изготовлен из', 'МАТЕРИАЛ ИЗДЕЛИЯ']) {
    assert.equal(normalizeCharName(v), 'Материал', `«${v}»`)
  }
  for (const v of ['Диаметр', 'Диаметр изделия', 'Размер по диаметру', 'диаметр, мм', 'Ø']) {
    assert.equal(normalizeCharName(v), 'Диаметр', `«${v}»`)
  }
  assert.equal(normalizeCharName('Объём'), 'Объём')
  assert.equal(normalizeCharName('вместимость'), 'Объём')
  assert.equal(normalizeCharName('Форма выпуска'), 'Форма')
})

test('normalizeCharName: незнакомое имя сохраняется (Title-case), не выдумывается', () => {
  assert.equal(normalizeCharName('морозостойкость'), 'Морозостойкость')
  assert.equal(normalizeCharName('  pH  '), 'Ph')
})

test('одинаковые характеристики объединяются, частота считается верно', () => {
  const specs = [
    [{ name: 'Материал', value: 'пластик' }, { name: 'Диаметр', value: '20', unit: 'см' }],
    [{ name: 'Материал изготовления', value: 'полипропилен' }, { name: 'Диаметр', value: '18', unit: 'см' }],
    [{ name: 'Изготовлен из', value: 'ПП' }, { name: 'Цвет', value: 'белый' }],
  ]
  const agg = aggregateCharacteristics(specs, { mainThreshold: 0.5, minThreshold: 0.2 })
  const mat = byName(agg, 'Материал')
  assert.ok(mat, `Материал должен быть: ${names(agg)}`)
  assert.equal(mat.frequency, 3)
  assert.equal(mat.totalSpecs, 3)
  assert.equal(mat.confidence, 1)
  assert.equal(mat.level, 'main')
  const dia = byName(agg, 'Диаметр')
  assert.equal(dia.frequency, 2)
  assert.equal(dia.unit, 'см')
})

test('одно ТЗ учитывает каноническое имя не более одного раза', () => {
  const specs = [
    [
      { name: 'Материал', value: 'пластик' },
      { name: 'Материал корпуса', value: 'ПП' }, // тот же canon в одном ТЗ
    ],
    [{ name: 'Материал', value: 'металл' }],
  ]
  const agg = aggregateCharacteristics(specs)
  assert.equal(byName(agg, 'Материал').frequency, 2) // 2 ТЗ, не 3
})

test('редкие характеристики (<20%) отбрасываются', () => {
  const specs = Array.from({ length: 10 }, (_, i) => {
    const row = [{ name: 'Материал', value: 'пластик' }]
    if (i === 0) row.push({ name: 'Артикул', value: 'A-1' }) // 1/10 = 10%
    if (i < 3) row.push({ name: 'Цвет', value: 'белый' }) // 3/10 = 30%
    return row
  })
  const agg = aggregateCharacteristics(specs, { minThreshold: 0.2 })
  assert.ok(names(agg).includes('Материал'))
  assert.ok(names(agg).includes('Цвет'))
  assert.ok(!names(agg).includes('Артикул'), 'редкая характеристика не должна попасть')
})

test('характеристики не придумываются: в выдаче только то, что подано на вход', () => {
  const specs = [
    [{ name: 'Материал', value: 'пластик' }],
    [{ name: 'Материал', value: 'ПП' }],
  ]
  const agg = aggregateCharacteristics(specs)
  assert.deepEqual(names(agg), ['Материал'])
  // никаких «обычно важны диаметр/объём/цвет»
  for (const n of ['Диаметр', 'Объём', 'Цвет', 'Высота']) {
    assert.ok(!names(agg).includes(n), `${n} не должен появиться из ниоткуда`)
  }
})

test('provenance сохраняется: rawNames, examples, frequency, totalSpecs, confidence', () => {
  const specs = [
    [{ name: 'Материал изготовления', value: 'пластик' }],
    [{ name: 'Изготовлен из', value: 'полипропилен' }],
    [{ name: 'Материал', value: 'пластик PP' }],
    [{ name: 'Материал', value: 'пластик' }], // дубль значения — в examples один раз
  ]
  const agg = aggregateCharacteristics(specs)
  const mat = byName(agg, 'Материал')
  assert.equal(mat.frequency, 4)
  assert.equal(mat.totalSpecs, 4)
  assert.equal(mat.confidence, 1)
  assert.deepEqual([...mat.rawNames].sort(), ['Изготовлен из', 'Материал', 'Материал изготовления'])
  assert.deepEqual(mat.examples, ['пластик', 'полипропилен', 'пластик PP'])
})

test('порог main/additional настраивается, а не зашит', () => {
  const specs = Array.from({ length: 10 }, (_, i) => {
    const row = [{ name: 'Материал', value: 'x' }]
    if (i < 4) row.push({ name: 'Цвет', value: 'белый' }) // 4/10 = 40%
    return row
  })
  const a = aggregateCharacteristics(specs, { mainThreshold: 0.5, minThreshold: 0.2 })
  assert.equal(byName(a, 'Цвет').level, 'additional')
  const b = aggregateCharacteristics(specs, { mainThreshold: 0.35, minThreshold: 0.2 })
  assert.equal(byName(b, 'Цвет').level, 'main')
})

test('шаблонные строки таблицы goszakup не попадают в характеристики', () => {
  const specs = [
    [
      { name: 'Номер закупки', value: 'No 1' },
      { name: 'Наименование лота', value: 'Грунт' },
      { name: 'Количество', value: '20' },
      { name: 'Места поставки', value: 'Астана' },
      { name: 'Материал', value: 'торф' },
    ],
    [{ name: 'Материал', value: 'торф' }],
  ]
  const agg = aggregateCharacteristics(specs)
  assert.deepEqual(names(agg), ['Материал'])
})

test('пустой вход → пустой результат (не бросает)', () => {
  assert.deepEqual(aggregateCharacteristics([]), [])
})

test('детерминированность', () => {
  const specs = [
    [{ name: 'Материал', value: 'a' }, { name: 'Цвет', value: 'b' }],
    [{ name: 'Материал', value: 'c' }],
  ]
  assert.equal(JSON.stringify(aggregateCharacteristics(specs)), JSON.stringify(aggregateCharacteristics(specs)))
})

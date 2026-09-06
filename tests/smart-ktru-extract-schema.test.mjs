// Нормализация ответа AI в ExtractedSpecification — без сети, на фикстурах.
//   node --test tests/smart-ktru-extract-schema.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeExtraction } from '../src/lib/smart-ktru/spec-extract.ts'

test('строка без rawRequirement отбрасывается (AI не должен придумывать)', () => {
  const s = normalizeExtraction({
    characteristics: [
      { name: 'Материал', value: 'пластик', requirementType: 'text', rawRequirement: 'Материал: пластик' },
      { name: 'Цвет', value: 'зелёный', requirementType: 'text' }, // нет rawRequirement → выкинуть
      { value: '30', requirementType: 'exact', rawRequirement: 'диаметр 30' }, // нет name → выкинуть
    ],
  })
  assert.equal(s.characteristics.length, 1)
  assert.equal(s.characteristics[0].name, 'Материал')
  assert.ok(s.meta.warnings.some((w) => /пропущено требование/i.test(w)))
})

test('невалидный requirementType → text; confidence зажимается в [0,1]', () => {
  const s = normalizeExtraction({
    characteristics: [
      { name: 'X', value: '1', requirementType: 'потолок', rawRequirement: 'X = 1', confidence: 5 },
      { name: 'Y', value: '2', requirementType: 'min', rawRequirement: 'Y не менее 2', confidence: -3 },
    ],
  })
  assert.equal(s.characteristics[0].requirementType, 'text')
  assert.equal(s.characteristics[0].confidence, 1)
  assert.equal(s.characteristics[1].requirementType, 'min')
  assert.equal(s.characteristics[1].confidence, 0)
})

test('quantity/delivery добираются из таблицы шаблона, если AI не дал', () => {
  const s = normalizeExtraction(
    { characteristics: [] },
    {
      tableRows: [
        { name: 'Номер закупки', value: 'No 1-1' },
        { name: 'Количество', value: '20' },
        { name: 'Единица измерения', value: 'Одна пачка' },
        { name: 'Места поставки', value: 'г. Астана' },
        { name: 'Срок поставки', value: '15 дней' },
      ],
    },
  )
  assert.equal(s.quantity?.value, 20)
  assert.equal(s.quantity?.unit, 'Одна пачка')
  assert.equal(s.delivery?.place, 'г. Астана')
  assert.equal(s.meta.templateRecognized, true)
})

test('documents собираются из отдельного массива и из требований типа document', () => {
  const s = normalizeExtraction({
    documents: ['Сертификат соответствия'],
    characteristics: [
      { name: 'СТ-KZ', value: null, requirementType: 'document', rawRequirement: 'наличие СТ-KZ' },
    ],
  })
  assert.deepEqual([...s.documents].sort(), ['СТ-KZ', 'Сертификат соответствия'])
})

test('source.text и page нормализуются', () => {
  const s = normalizeExtraction({
    characteristics: [
      { name: 'A', value: '1', requirementType: 'exact', rawRequirement: 'A=1', source: { text: 'фрагмент', page: '2' } },
    ],
  })
  assert.equal(s.characteristics[0].source?.text, 'фрагмент')
  assert.equal(s.characteristics[0].source?.page, 2)
})

test('пустой ответ → method failed, warning про 0 требований', () => {
  const s = normalizeExtraction({}, {})
  assert.equal(s.characteristics.length, 0)
  assert.equal(s.meta.method, 'failed')
  assert.ok(s.meta.warnings.some((w) => /ни одного требования/i.test(w)))
})

test('мусор вместо объекта не роняет', () => {
  const s = normalizeExtraction('не json', {})
  assert.equal(s.characteristics.length, 0)
})

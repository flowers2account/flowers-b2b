// Тесты умного поиска КТРУ v1.
//   node --test tests/ktru-search.test.mjs
//   npm run ktru:test
//
// Работают на РЕАЛЬНОМ индексе data/enstru/enstru_index.json (v1 — маленький,
// собранный из планов). Проверяем ранжирование и защиту от ложных совпадений.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { searchKtru } from '../src/lib/ktru/search.ts'
import { normalizeSearchQuery, lemma, tokenize } from '../src/lib/ktru/normalize.ts'
import { ATTRIBUTE_TERMS } from '../src/lib/ktru/synonyms.ts'

const codes = (res) => res.map((r) => r.code)
const top = (q, n = 10) => searchKtru(q, { limit: n })

test('normalizeSearchQuery: регистр, пунктуация, пробелы, ё', () => {
  assert.equal(normalizeSearchQuery('  Грунт, для   ЦВЕТОВ! '), 'грунт для цветов')
  assert.equal(normalizeSearchQuery('Ёмкость—пластик'), 'емкость пластик')
})

test('tokenize: стоп-слова выкидываются, характеристики помечаются', () => {
  const t = tokenize(normalizeSearchQuery('горшок пластиковый для цветов'), ATTRIBUTE_TERMS)
  const raws = t.map((x) => x.raw)
  assert.ok(!raws.includes('для'))
  assert.ok(raws.includes('горшок'))
  const plastic = t.find((x) => x.raw === 'пластиковый')
  assert.ok(plastic && plastic.isAttr)
})

test('lemma: словоформы сходятся к базовой', () => {
  assert.equal(lemma('цветы'), lemma('цветов'))
  assert.equal(lemma('горшки'), 'горшок')
  assert.equal(lemma('удобрения'), 'удобрение')
})

test('«грунт для цветов» → топ-1 это код грунта 081212.119.000010', () => {
  const res = top('грунт для цветов')
  assert.ok(res.length > 0)
  assert.equal(res[0].code, '081212.119.000010')
  assert.ok(res[0].score >= 0.5)
})

test('«земля для цветов» → в топ-3 есть код с названием «Грунт» (синоним)', () => {
  const res = top('земля для цветов')
  const grunt = res.slice(0, 3).find((r) => /грунт/i.test(r.nameRu))
  assert.ok(grunt, `ожидали Грунт в топ-3, получили: ${codes(res.slice(0, 3)).join(', ')}`)
  assert.ok(grunt.reasons.some((x) => x.includes('синоним')))
})

test('«подкормка для комнатных растений» → находит «Удобрение» 201539.900.000000', () => {
  const res = top('подкормка для комнатных растений')
  assert.ok(codes(res).includes('201539.900.000000'),
    `получили: ${codes(res).join(', ')}`)
})

test('«горшок пластиковый» → пластиковый горшок выше керамического', () => {
  const res = top('горшок пластиковый')
  const iPlastic = codes(res).indexOf('222929.900.000114') // Горшок пластиковый для цветов
  const iCeramic = codes(res).indexOf('234911.000.000001') // Горшок для цветов, керамический
  assert.ok(iPlastic !== -1, 'пластиковый горшок должен быть в выдаче')
  if (iCeramic !== -1) {
    assert.ok(iPlastic < iCeramic,
      `пластиковый (#${iPlastic}) должен быть выше керамического (#${iCeramic})`)
  }
})

test('ложные совпадения: «живые цветы» НЕ поднимает керамические «Цветы» в топ-3', () => {
  const res = top('живые цветы')
  const decorInTop3 = res.slice(0, 3).some((r) =>
    ['234112.500.000044', '234112.500.000045', '234113.300.000010', '234113.300.000011'].includes(r.code))
  assert.ok(!decorInTop3,
    `керамический декор попал в топ-3: ${codes(res.slice(0, 3)).join(', ')}`)
})

test('ложные совпадения: «цветы для продажи» — декор-«Цветы» не в топ-3', () => {
  const res = top('цветы для продажи')
  const decorInTop3 = res.slice(0, 3).some((r) => r.code.startsWith('2341'))
  assert.ok(!decorInTop3, `декор в топ-3: ${codes(res.slice(0, 3)).join(', ')}`)
})

test('каждый из 20 контрольных запросов не падает и возвращает массив', () => {
  const queries = [
    'грунт', 'грунт для цветов', 'земля для цветов', 'почвогрунт',
    'субстрат для растений', 'удобрение', 'удобрение для комнатных растений',
    'подкормка для цветов', 'горшок', 'горшки для цветов', 'горшок пластиковый',
    'кашпо', 'вазон для цветов', 'комнатные растения', 'цветы', 'срезанные цветы',
    'букет', 'рассада цветов', 'саженцы', 'семена цветов',
  ]
  for (const q of queries) {
    const res = searchKtru(q, { limit: 10 })
    assert.ok(Array.isArray(res), `${q}: не массив`)
    for (const r of res) {
      assert.equal(typeof r.code, 'string')
      assert.ok(r.score >= 0 && r.score <= 1, `${q}: score вне [0,1]`)
      assert.ok(Array.isArray(r.reasons) && r.reasons.length > 0, `${q}: нет reasons`)
    }
  }
})

test('детерминированность: одинаковый запрос → одинаковый результат', () => {
  const a = JSON.stringify(top('удобрение для комнатных растений'))
  const b = JSON.stringify(top('удобрение для комнатных растений'))
  assert.equal(a, b)
})

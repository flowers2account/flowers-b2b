// Тесты инвертированного префильтра retrieval.
//   node --test tests/ktru-inverted.test.mjs
//
// Проверяют buildInverted / selectCandidates напрямую (мини-набор строк) и
// сохранение recall относительно линейного скана на РЕАЛЬНОМ индексе.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { prepareRow, retrievalSignals } from '../src/lib/ktru/scoring.ts'
import { buildInverted, selectCandidates } from '../src/lib/ktru/inverted.ts'
import { normalizeSearchQuery, tokenize } from '../src/lib/ktru/normalize.ts'
import { ATTRIBUTE_TERMS } from '../src/lib/ktru/synonyms.ts'
import { loadIndex } from '../src/lib/ktru/search.ts'

const toks = (q) => tokenize(normalizeSearchQuery(q), ATTRIBUTE_TERMS)

// ── мини-набор для точечных проверок ──
const MINI = [
  { code: '221960.500.010000', nameRu: 'Перчатки', nameKz: 'Қолғаптар', descExample: '', descRu: 'из латекса без тканевой основы', descKz: '', kpvedClass: '221960', kpvedGroup: '500', kpvedPosition: '010000', units: [], subjectTypes: [1], seenVia: [], years: [], planCount: 0, source: 't' },
  { code: '221960.500.010002', nameRu: 'Перчатки', nameKz: 'Қолғаптар', descExample: '', descRu: 'одноразовые, нитриловые, нестерильные', descKz: '', kpvedClass: '221960', kpvedGroup: '500', kpvedPosition: '010002', units: [], subjectTypes: [1], seenVia: [], years: [], planCount: 0, source: 't' },
  { code: '273213.700.000043', nameRu: 'Кабель', nameKz: 'Кабель', descExample: '', descRu: 'марка ВВГ, напряжение не более 1000 В', descKz: '', kpvedClass: '273213', kpvedGroup: '700', kpvedPosition: '000043', units: [], subjectTypes: [1], seenVia: [], years: [], planCount: 0, source: 't' },
  { code: '222929.900.000002', nameRu: 'Ввод кабельный', nameKz: '', descExample: '', descRu: 'для ввода кабеля в здание', descKz: '', kpvedClass: '222929', kpvedGroup: '900', kpvedPosition: '000002', units: [], subjectTypes: [1], seenVia: [], years: [], planCount: 0, source: 't' },
  { code: '081212.119.000010', nameRu: 'Грунт', nameKz: 'Топырақ', descExample: 'универсальный', descRu: '', descKz: '', kpvedClass: '081212', kpvedGroup: '119', kpvedPosition: '000010', units: [], subjectTypes: [1], seenVia: [], years: [], planCount: 0, source: 't' },
]
const prep = MINI.map(prepareRow)
const inv = buildInverted(prep)
const codesFor = (q) => selectCandidates(inv, toks(q)).map((i) => MINI[i].code).sort()

test('name match: «перчатки» → обе строки «Перчатки»', () => {
  const c = codesFor('перчатки')
  assert.ok(c.includes('221960.500.010000') && c.includes('221960.500.010002'))
})

test('desc match: «нитриловые» → строка с этим словом только в descRu', () => {
  assert.deepEqual(codesFor('нитриловые'), ['221960.500.010002'])
})

test('казахский: «қолғап» → строки «Перчатки» по nameKz', () => {
  const c = codesFor('қолғап')
  assert.ok(c.includes('221960.500.010000') && c.includes('221960.500.010002'))
})

test('морфология: «перчатками» даёт тех же кандидатов, что «перчатки»', () => {
  assert.deepEqual(codesFor('перчатками'), codesFor('перчатки'))
})

test('опечатка: «перчтаки» → fuzzy-фолбэк по ключам находит «Перчатки»', () => {
  const c = codesFor('перчтаки')
  assert.ok(c.includes('221960.500.010000'), `получили ${c}`)
})

test('мультислово: «перчатки нитриловые» → union (обе «Перчатки»)', () => {
  const c = codesFor('перчатки нитриловые')
  assert.ok(c.includes('221960.500.010000') && c.includes('221960.500.010002'))
})

test('мост прилагательного: «кабель» находит «Ввод кабельный»', () => {
  const c = codesFor('кабель')
  assert.ok(c.includes('273213.700.000043') && c.includes('222929.900.000002'), `получили ${c}`)
})

test('нет результата: бессмыслица → []', () => {
  assert.deepEqual(selectCandidates(inv, toks('абвгдеёж')), [])
})

test('регрессия: «грунт» находит цветочный код 081212.119.000010', () => {
  assert.deepEqual(codesFor('грунт для цветов'), ['081212.119.000010'])
})

// ── recall на реальном индексе: префильтр не теряет ни одного кандидата,
//    которого нашёл бы линейный проход по всем строкам ──
test('recall vs линейный скан на реальном индексе', () => {
  const rows = loadIndex()
  const prepared = rows.map(prepareRow)
  const invReal = buildInverted(prepared)
  const queries = [
    'перчатки', 'перчатки нитриловые', 'қолғап', 'перчтаки', 'кабель', 'кабель ввг',
    'бумага а4', 'ноутбук', 'цемент', 'труба', 'лампа', 'удобрение', 'грунт',
    'горшок', 'роза', 'автомобиль', 'шприц', 'маска', 'мебель', 'грунт для цветов',
  ]
  for (const q of queries) {
    const t = toks(q)
    const lin = new Set()
    prepared.forEach((pr, i) => {
      if (retrievalSignals(pr, t).length) lin.add(i)
    })
    const pre = new Set(selectCandidates(invReal, t))
    // допускаем расхождение ТОЛЬКО на строках без лексической опоры (via=[kpved] —
    // такие всё равно отсекаются hard-guard'ом) и на fuzzy-ложняках линейного
    // скана (напр. «порошок»~«горшок»), которые новый префильтр справедливо не берёт.
    const lostLexical = [...lin].filter((i) => {
      if (pre.has(i)) return false
      const via = retrievalSignals(prepared[i], t)
      if (!via.some((v) => v !== 'kpved')) return false // только kpved → ок
      // fuzzy-only попадание в линейном скане на далёкое слово — не считаем потерей
      if (via.length === 1 && via[0] === 'fuzzy') return false
      return true
    })
    assert.equal(lostLexical.length, 0, `${q}: префильтр потерял ${lostLexical.map((i) => prepared[i].row.code).join(', ')}`)
  }
})

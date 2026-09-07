// Тесты Auto KTRU Match (подбор КТРУ по карточке товара).
//   node --test tests/ktru-match.test.mjs
//
// Работают на РЕАЛЬНОМ индексе data/enstru/enstru_index.json (v1, собран из
// планов goszakup). Проверяют: правильный TOP, защиту от ложных совпадений,
// поведение на непонятном запросе, учёт характеристик.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matchKtru, buildMatchQuery } from '../src/lib/ktru/match.ts'

const codes = (res) => res.map((r) => r.code)

test('buildMatchQuery: берёт материал из характеристик, отбрасывает размеры/цвета', () => {
  const q = buildMatchQuery('Горшок', [
    { name: 'Материал', value: 'керамика' },
    { name: 'Диаметр', value: '20 см' },
    { name: 'Цвет', value: 'белый' },
  ])
  assert.ok(/горшок/i.test(q))
  assert.ok(/керамик/i.test(q), `ожидали материал в запросе: "${q}"`)
  assert.ok(!/20|см|бел/i.test(q), `размер/цвет не должны попасть: "${q}"`)
})

test('Тест 1: «Горшок пластиковый для цветов» → TOP 222929.900.000114', () => {
  const { results, confident } = matchKtru('Горшок пластиковый для цветов', [])
  assert.ok(confident)
  assert.equal(results[0].code, '222929.900.000114')
})

test('Тест 2: «Грунт универсальный для комнатных растений» → TOP 081212.119.000010', () => {
  const { results, confident } = matchKtru('Грунт универсальный для комнатных растений', [])
  assert.ok(confident)
  assert.equal(results[0].code, '081212.119.000010')
})

test('Тест 3: «Удобрение универсальное» → TOP 201539.900.000000', () => {
  const { results, confident } = matchKtru('Удобрение универсальное', [])
  assert.ok(confident)
  assert.equal(results[0].code, '201539.900.000000')
})

test('Тест 4: «Срезанные розы» → Роза, без декоративных «Цветы»', () => {
  const { results } = matchKtru('Срезанные розы', [])
  assert.ok(results.length > 0)
  assert.equal(results[0].code, '011921.110.000000') // Роза
  // никаких декоративных изделий из керамики/фарфора (класс 2341xx) и «Семена»
  assert.ok(!codes(results).some((c) => c.startsWith('2341')), `декор в выдаче: ${codes(results)}`)
  assert.ok(!results.some((r) => /семена/i.test(r.name)), 'семена не должны попасть')
})

test('Тест 5: «Керамический горшок для цветов» → керамический выше пластикового', () => {
  const { results } = matchKtru('Керамический горшок для цветов', [])
  const iCeramic = codes(results).indexOf('234911.000.000001')
  const iPlastic = codes(results).indexOf('222929.900.000114')
  assert.ok(iCeramic !== -1, `керамический горшок должен быть в выдаче: ${codes(results)}`)
  if (iPlastic !== -1) {
    assert.ok(iCeramic < iPlastic, `керамический (#${iCeramic}) должен быть выше пластикового (#${iPlastic})`)
  }
})

test('Тест 5b: материал из характеристик разводит керамику и пластик', () => {
  const ceramic = matchKtru('Горшок', [{ name: 'Материал', value: 'керамика' }])
  const plastic = matchKtru('Горшок', [{ name: 'Материал', value: 'пластик' }])
  assert.equal(ceramic.results[0].code, '234911.000.000001')
  assert.equal(plastic.results[0].code, '222929.900.000114')
})

test('Тест 6: непонятный запрос «товар для сада» → confident=false, results пуст', () => {
  const { results, confident } = matchKtru('товар для сада', [])
  assert.equal(confident, false)
  assert.equal(results.length, 0)
})

test('нерелевантные запросы вне домена → confident=false (нет ложных срабатываний)', () => {
  // NB: «перчатки» больше НЕ вне домена — коды перчаток намыты в индекс из планов
  // (scripts/ktru-harvest.mjs), см. позитивный тест ниже.
  for (const q of ['мебель офисная', 'медицинский расходник', 'бензин', 'услуги охраны', 'огнетушитель порошковый']) {
    const { results, confident } = matchKtru(q, [])
    assert.equal(confident, false, `${q}: не должно быть уверенного КТРУ, получили ${codes(results)}`)
  }
})

test('расходка вне цветочного домена: «Перчатки нитриловые» → несколько реальных КТРУ', () => {
  const { results, confident } = matchKtru('Перчатки нитриловые', [])
  assert.ok(confident, 'перчатки должны находиться уверенно')
  assert.ok(results.length >= 2, `ожидали несколько кандидатов: ${codes(results)}`)
  assert.ok(results.every((r) => /перчатк/i.test(r.name)))
  assert.equal(results[0].code.slice(0, 6), '221960', `топ: ${results[0].code}`)
})

test('форма результата: code/name/score/confidence/reason', () => {
  const { results } = matchKtru('горшок пластиковый', [])
  assert.ok(results.length > 0)
  for (const r of results) {
    assert.equal(typeof r.code, 'string')
    assert.equal(typeof r.name, 'string')
    assert.ok(r.score >= 0 && r.score <= 1)
    assert.ok(r.confidence === 'high' || r.confidence === 'medium')
    assert.ok(typeof r.reason === 'string' && r.reason.length > 0)
  }
})

test('TOP не длиннее 10 и отсортирован по убыванию score', () => {
  const { results } = matchKtru('грунт для растений', [])
  assert.ok(results.length <= 10)
  for (let i = 1; i < results.length; i++) {
    assert.ok(results[i - 1].score >= results[i].score, 'нарушен порядок сортировки')
  }
})

test('детерминированность: одинаковый вход → одинаковый результат', () => {
  const a = JSON.stringify(matchKtru('удобрение для комнатных растений', [{ name: 'Тип', value: 'универсальное' }]))
  const b = JSON.stringify(matchKtru('удобрение для комнатных растений', [{ name: 'Тип', value: 'универсальное' }]))
  assert.equal(a, b)
})

test('несколько реальных запросов не падают', () => {
  const qs = [
    'горшок пластиковый', 'грунт', 'удобрение', 'срезанные цветы', 'комнатное растение',
    'рассада', 'семена цветов', 'кашпо декоративное', 'торф', 'дренаж керамзит',
  ]
  for (const q of qs) {
    const out = matchKtru(q, [])
    assert.ok(Array.isArray(out.results), `${q}: results не массив`)
    assert.equal(typeof out.confident, 'boolean')
  }
})

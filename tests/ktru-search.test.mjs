// Тесты умного поиска КТРУ v1.
//   node --test tests/ktru-search.test.mjs
//   npm run ktru:test
//
// Работают на РЕАЛЬНОМ индексе data/enstru/enstru_index.json (v1 — маленький,
// собранный из планов). Проверяем ранжирование и защиту от ложных совпадений.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
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

/* ─────────────────────────────────────────────────────────────────────────────
   КТРУ вне цветочного домена: «перчатки» и уточнения к ним.
   Смысл: поиск НЕ требует точного совпадения имени и обязан вернуть НЕСКОЛЬКО
   реальных кандидатов, каждый — с описанием, чем он отличается.
   ──────────────────────────────────────────────────────────────────────────── */

const INDEX_CODES = new Set(
  (() => {
    const j = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'data', 'enstru', 'enstru_index.json'), 'utf8'),
    )
    return (Array.isArray(j) ? j : j.rows).map((r) => r.code)
  })(),
)

// НИКАКИХ придуманных КТРУ: каждый выданный код существует в индексе.
const allReal = (res) => res.every((r) => INDEX_CODES.has(r.code))

test('«перчатки» → несколько реальных кандидатов с разными описаниями', () => {
  const res = top('перчатки')
  assert.ok(res.length >= 4, `ожидали ≥4 кандидата, получили ${res.length}`)
  assert.ok(allReal(res), 'в выдаче есть код, которого нет в индексе')
  assert.ok(
    res.every((r) => /перчатк/i.test(r.nameRu)),
    `не все кандидаты — «Перчатки»: ${res.map((r) => r.nameRu).join(', ')}`,
  )
  // описания различаются → UI может показать разницу
  const descs = new Set(res.map((r) => r.descRu).filter(Boolean))
  assert.ok(descs.size >= 3, `описания кандидатов не различаются: ${[...descs].join(' | ')}`)
  // среди кандидатов есть и латексные, и тканевые/защитные позиции
  const joined = res.map((r) => `${r.code} ${r.descRu || ''}`).join(' | ')
  assert.match(joined, /латекс/i)
  assert.match(joined, /ткан|защит|нитрил|кожа/i)
  // топ-результат объясняет себя через реальное описание КТРУ
  assert.ok(res[0].reasons.some((x) => x.startsWith('описание КТРУ:')))
  assert.ok(res[0].score >= 0.5)
})

test('«перчатка» (ед. ч.) → тот же набор кандидатов, что и «перчатки»', () => {
  const a = codes(top('перчатки')).slice(0, 5).sort()
  const b = codes(top('перчатка')).slice(0, 5).sort()
  assert.deepEqual(b, a)
})

test('«қолғап» (каз.) → находит перчатки по nameKz', () => {
  const res = top('қолғап')
  assert.ok(res.length >= 3, `каз. запрос ничего не нашёл (${res.length})`)
  assert.ok(allReal(res))
  assert.ok(res.every((r) => /перчатк/i.test(r.nameRu)))
  assert.ok(res[0].score >= 0.3)
})

test('«перчатки хозяйственные» → есть кандидаты, топ — латексная позиция 221960', () => {
  const res = top('перчатки хозяйственные')
  assert.ok(res.length >= 3)
  assert.ok(allReal(res))
  assert.equal(res[0].code.slice(0, 6), '221960', `топ: ${res[0].code} ${res[0].descRu}`)
  assert.match(res[0].descRu || '', /латекс/i)
})

test('«перчатки медицинские» → топ-3 из класса КПВЭД 221960 (мед. изделия)', () => {
  const res = top('перчатки медицинские')
  assert.ok(res.length >= 3)
  assert.ok(allReal(res))
  for (const r of res.slice(0, 3)) {
    assert.equal(r.code.slice(0, 6), '221960', `не мед. класс: ${r.code} — ${r.descRu}`)
  }
  // тканевые перчатки (класс 1419xx) не должны быть в топ-3
  assert.ok(!codes(res).slice(0, 3).some((c) => c.startsWith('1419')))
})

test('«перчатки нитриловые» → нитриловые позиции подняты через описание КТРУ', () => {
  const res = top('перчатки нитриловые')
  assert.ok(res.length >= 3)
  assert.ok(allReal(res))
  assert.match(res[0].descRu || '', /нитрил/i)
  assert.ok(
    res[0].retrievedVia.includes('desc'),
    `ожидали retrievedVia c 'desc', получили [${res[0].retrievedVia}]`,
  )
  assert.ok(res[0].reasons.some((x) => /нитрил/i.test(x)))
  // нитриловые выше «просто латексных»
  const iNitril = res.findIndex((r) => /нитрил/i.test(r.descRu || ''))
  const iLatex = res.findIndex((r) => /латекс/i.test(r.descRu || '') && !/нитрил/i.test(r.descRu || ''))
  assert.ok(iNitril === 0)
  if (iLatex !== -1) assert.ok(iNitril < iLatex)
})

test('«перчтаки» (опечатка) → fuzzy-совпадение с «Перчатки»', () => {
  const res = top('перчтаки')
  assert.ok(res.length >= 1, 'опечатка не дала кандидатов')
  assert.ok(allReal(res))
  assert.ok(res.every((r) => /перчатк/i.test(r.nameRu)))
  assert.ok(res[0].retrievedVia.includes('fuzzy'))
})

/* ── контрольные запросы из задания: наличие / топ / score / причина ── */

test('контрольные запросы задания: горшок пластиковый / универсальный грунт / удобрение / роза', () => {
  const cases = [
    { q: 'горшок пластиковый', top: '222929.900.000114', min: 0.6 },
    { q: 'универсальный грунт', top: '081212.119.000010', min: 0.6 },
    { q: 'удобрение', top: '201539.900.000000', min: 0.5 },
    { q: 'роза', top: '011921.110.000000', min: 0.4 },
  ]
  for (const c of cases) {
    const res = top(c.q)
    assert.ok(res.length > 0, `${c.q}: пусто`)
    assert.ok(allReal(res), `${c.q}: код вне индекса`)
    assert.equal(res[0].code, c.top, `${c.q}: топ ${res[0].code}, ждали ${c.top}`)
    assert.ok(res[0].score >= c.min, `${c.q}: score ${res[0].score} < ${c.min}`)
    assert.ok(res[0].reasons.length > 0, `${c.q}: нет причин`)
  }
})

/* ── регрессия: раньше работавшие цветочные запросы не сломаны ── */

test('регрессия: пластмассовый горшок / универсальный грунт / универсальное удобрение / срезанные розы / комнатное растение', () => {
  const cases = [
    { q: 'пластмассовый горшок', top: '222929.900.000114' },
    { q: 'универсальный грунт', top: '081212.119.000010' },
    { q: 'универсальное удобрение', top: '201539.900.000000' },
    { q: 'срезанные розы', top: '011921.110.000000' },
    { q: 'комнатное растение', top: '013010.200.000000' },
  ]
  for (const c of cases) {
    const res = top(c.q)
    assert.ok(res.length > 0, `${c.q}: пусто`)
    assert.equal(res[0].code, c.top, `${c.q}: топ ${res[0].code}, ждали ${c.top}`)
  }
})

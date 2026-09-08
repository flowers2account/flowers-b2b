// Multi-KTRU у товара: роли primary/alternative, запрет дублей, смена primary.
//   node --test tests/product-ktru.test.mjs
// Тестируем чистые reducer-хелперы из ktru-profile.ts (store-действия — тонкие обёртки над ними).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeKtruList,
  addKtruEntry,
  removeKtruEntry,
  setPrimaryEntry,
  setKtruList,
  ktruListFromCodes,
} from '../src/lib/smart-ktru/ktru-profile.ts'

const codes = (l) => l.map((e) => e.code)
const primary = (l) => l.find((e) => e.role === 'primary')?.code ?? null

test('DoD#1 — у товара есть primary КТРУ (первый код становится primary)', () => {
  const l = ktruListFromCodes(['222929.900.000114'])
  assert.equal(l.length, 1)
  assert.equal(primary(l), '222929.900.000114')
  assert.equal(l[0].source, 'imported')
})

test('DoD#2 — товар может иметь несколько alternative КТРУ', () => {
  let l = ktruListFromCodes(['a'])
  l = addKtruEntry(l, 'b')
  l = addKtruEntry(l, 'c')
  assert.deepEqual(codes(l).sort(), ['a', 'b', 'c'])
  assert.equal(primary(l), 'a')
  assert.equal(l.filter((e) => e.role === 'alternative').length, 2)
})

test('DoD#3 — дубликат кода не создаётся (add — no-op)', () => {
  let l = ktruListFromCodes(['a', 'b'])
  const before = JSON.stringify(l)
  l = addKtruEntry(l, 'a') // уже есть как primary
  l = addKtruEntry(l, 'b', 'primary') // уже есть — роль не меняем через add
  assert.equal(codes(l).length, 2)
  assert.equal(JSON.stringify(l), before)
})

test('DoD#3 — setKtruList схлопывает дубли во входе', () => {
  const l = setKtruList([{ code: 'a' }, { code: 'a', role: 'primary' }, { code: 'b' }, { code: ' ' }])
  assert.deepEqual(codes(l).sort(), ['a', 'b'])
})

test('DoD#4 — можно поменять primary, прежний становится alternative', () => {
  let l = ktruListFromCodes(['a', 'b', 'c'])
  assert.equal(primary(l), 'a')
  l = setPrimaryEntry(l, 'c')
  assert.equal(primary(l), 'c')
  assert.equal(l.find((e) => e.code === 'a').role, 'alternative')
  assert.equal(l.filter((e) => e.role === 'primary').length, 1)
})

test('DoD#4 — addKtruEntry(role=primary) демотирует прежний primary', () => {
  let l = ktruListFromCodes(['a'])
  l = addKtruEntry(l, 'b', 'primary')
  assert.equal(primary(l), 'b')
  assert.equal(l.find((e) => e.code === 'a').role, 'alternative')
})

test('DoD#5 — удаление alternative НЕ трогает primary', () => {
  let l = ktruListFromCodes(['a', 'b', 'c'])
  l = removeKtruEntry(l, 'b')
  assert.deepEqual(codes(l).sort(), ['a', 'c'])
  assert.equal(primary(l), 'a')
})

test('DoD#5 — удаление primary промотит первую alternative', () => {
  let l = ktruListFromCodes(['a', 'b', 'c'])
  l = removeKtruEntry(l, 'a')
  assert.deepEqual(codes(l).sort(), ['b', 'c'])
  assert.equal(l.filter((e) => e.role === 'primary').length, 1) // ровно один primary остаётся
})

test('setPrimaryEntry на несуществующий код — no-op', () => {
  const l = ktruListFromCodes(['a', 'b'])
  assert.equal(JSON.stringify(setPrimaryEntry(l, 'zzz')), JSON.stringify(l))
})

test('normalizeKtruList — ровно один primary при любом входе', () => {
  assert.equal(normalizeKtruList([]).length, 0)
  const two = normalizeKtruList([
    { code: 'a', role: 'primary' }, { code: 'b', role: 'primary' },
  ])
  assert.equal(two.filter((e) => e.role === 'primary').length, 1)
  const none = normalizeKtruList([{ code: 'a', role: 'alternative' }, { code: 'b', role: 'alternative' }])
  assert.equal(none.filter((e) => e.role === 'primary').length, 1)
  assert.equal(none[0].role, 'primary')
})

test('пустой список кодов → пустой ktru', () => {
  assert.deepEqual(ktruListFromCodes([]), [])
  assert.deepEqual(ktruListFromCodes(['', '  ']), [])
})

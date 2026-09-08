// persist migrate v0/v1 → v2: ktruCodes[] → ktru: ProductKtru[], безопасно и идемпотентно.
//   node --test tests/smart-ktru-migrate.test.mjs
// (DoD #4, задача #22 — existing товары мигрируются без потери данных)

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { migrateSmartKtru } from '../src/lib/smart-ktru/store.ts'

const primary = (ktru) => ktru.find((k) => k.role === 'primary')?.code ?? null

test('v1 {ktruCodes:[a,b]} → ktru:[{a,primary},{b,alternative}], ktruCodes удалён', () => {
  const v1 = {
    products: [
      { id: 'p1', name: 'Горшок', characteristics: [], ktruCodes: ['a', 'b'], createdAt: 'x', updatedAt: 'y' },
    ],
    working: [], analysisCache: {}, ktruCharCache: {},
  }
  const m = migrateSmartKtru(v1, 1)
  const p = m.products[0]
  assert.equal(p.ktruCodes, undefined)
  assert.equal(p.ktru.length, 2)
  assert.equal(primary(p.ktru), 'a')
  assert.equal(p.ktru.find((k) => k.code === 'b').role, 'alternative')
  assert.equal(p.ktru[0].source, 'imported')
  // остальные поля товара не тронуты
  assert.equal(p.name, 'Горшок')
  assert.equal(p.id, 'p1')
})

test('пустой / отсутствующий ktruCodes → ktru: []', () => {
  const m = migrateSmartKtru({ products: [
    { id: 'p1', name: 'A', characteristics: [], ktruCodes: [] },
    { id: 'p2', name: 'B', characteristics: [] },
    { id: 'p3', name: 'C', characteristics: [], ktruCodes: ['', '  ', 42] },
  ] }, 0)
  assert.deepEqual(m.products.map((p) => p.ktru), [[], [], []])
  assert.ok(m.products.every((p) => p.ktruCodes === undefined))
})

test('идемпотентность — повторный migrate ничего не меняет', () => {
  const v1 = { products: [{ id: 'p1', name: 'X', characteristics: [], ktruCodes: ['a', 'b', 'c'] }] }
  const once = migrateSmartKtru(v1, 1)
  const twice = migrateSmartKtru(JSON.parse(JSON.stringify(once)), 2)
  assert.deepEqual(twice.products[0].ktru, once.products[0].ktru)
  assert.equal(primary(twice.products[0].ktru), 'a')
})

test('уже v2-форма (ktru — массив) не ломается, legacy-хвост снимается', () => {
  const v2 = { products: [{
    id: 'p1', name: 'X', characteristics: [],
    ktru: [{ code: 'a', role: 'primary', source: 'user', createdAt: 't', updatedAt: 't' }],
    ktruCodes: ['a'], // мусорный хвост
  }] }
  const m = migrateSmartKtru(v2, 1)
  assert.equal(m.products[0].ktruCodes, undefined)
  assert.equal(m.products[0].ktru.length, 1)
  assert.equal(m.products[0].ktru[0].source, 'user') // не перезатёрли
})

test('groups добавляется, working/analysisCache сохраняются', () => {
  const v1 = {
    products: [{ id: 'p1', name: 'X', characteristics: [], ktruCodes: ['a'] }],
    working: [{ lotId: 1, productId: 'p1' }],
    analysisCache: { 1: { at: 't' } },
    ktruCharCache: { 'v1:a': { at: 't' } },
  }
  const m = migrateSmartKtru(v1, 1)
  assert.deepEqual(m.groups, [])
  assert.deepEqual(m.working, v1.working)
  assert.deepEqual(m.analysisCache, v1.analysisCache)
  assert.deepEqual(m.ktruCharCache, v1.ktruCharCache)
})

test('пустой / мусорный persisted не роняет', () => {
  assert.deepEqual(migrateSmartKtru(undefined, 0), { groups: [] })
  assert.deepEqual(migrateSmartKtru({}, 0), { groups: [] })
  assert.deepEqual(migrateSmartKtru(null, 1), { groups: [] })
})

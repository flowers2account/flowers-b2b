// Товарные группы + наследование KTRU Profile + приоритет product > group.
//   node --test tests/product-group.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'

// in-memory localStorage до импорта стора
if (!globalThis.localStorage) {
  const m = new Map()
  globalThis.localStorage = {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear(),
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size },
  }
}

const { effectiveKtruProfile, effectiveKtruCodes, ktruListFromCodes } = await import('../src/lib/smart-ktru/ktru-profile.ts')
const { useSmartKtru } = await import('../src/lib/smart-ktru/store.ts')

const reset = () =>
  useSmartKtru.setState({ products: [], groups: [], working: [], analysisCache: {}, ktruCharCache: {}, _seeded: true })

const mkProduct = (name, codes = []) => ({
  id: '', name, characteristics: [], ktru: ktruListFromCodes(codes, 'user'),
  createdAt: '2026-01-01', updatedAt: '2026-01-01',
})

test('DoD#6 — можно создать товарную группу', () => {
  reset()
  const id = useSmartKtru.getState().addGroup('Горшки пластиковые', 'все размеры')
  const g = useSmartKtru.getState().getGroup(id)
  assert.ok(g)
  assert.equal(g.name, 'Горшки пластиковые')
  assert.deepEqual(g.ktru, [])
})

test('DoD#7 — можно добавить 60 товаров в группу; сами товары не «ломаются»', () => {
  reset()
  const st = useSmartKtru.getState()
  const ids = []
  for (let i = 10; i <= 68; i++) ids.push(st.addProduct(mkProduct(`Горшок ${i} см`, ['222929.900.000114'])))
  assert.equal(ids.length, 59)
  ids.push(st.addProduct(mkProduct('Горшок 70 см', ['222929.900.000114'])))
  const gid = st.createGroupWithProducts('Горшки пластиковые', ids)
  const inGroup = useSmartKtru.getState().products.filter((p) => p.groupId === gid)
  assert.equal(inGroup.length, 60)
  // товары не изменены по сути — КТРУ/характеристики на месте
  assert.ok(inGroup.every((p) => p.ktru.length === 1 && p.ktru[0].code === '222929.900.000114'))
})

test('DoD#8 — Group KTRU наследуется товарами через effectiveKtruProfile', () => {
  const product = mkProduct('Горшок 20', []) // у товара своих КТРУ нет
  const group = { id: 'g', name: 'Горшки', ktru: ktruListFromCodes(['222929.900.000114', '236919.900.000010'], 'user'), createdAt: '', updatedAt: '' }
  const eff = effectiveKtruProfile(product, group)
  assert.deepEqual(effectiveKtruCodes(eff).sort(), ['222929.900.000114', '236919.900.000010'])
  assert.equal(eff.primary.length, 1)
  assert.equal(eff.primary[0].origin, 'group')
  assert.equal(eff.primary[0].code, '222929.900.000114')
})

test('DoD#9 — product-specific КТРУ имеет приоритет над group', () => {
  // товар: primary = X ; группа: primary = Y, плюс общий Z
  const product = mkProduct('Горшок', ['X'])
  const group = { id: 'g', name: 'G', ktru: [
    { code: 'Y', role: 'primary', source: 'user', createdAt: '', updatedAt: '' },
    { code: 'X', role: 'alternative', source: 'user', createdAt: '', updatedAt: '' },
  ], createdAt: '', updatedAt: '' }
  const eff = effectiveKtruProfile(product, group)
  // X пришёл из товара как primary (роль товара побеждает роль группы 'alternative')
  const x = eff.all.find((e) => e.code === 'X')
  assert.equal(x.origin, 'product')
  assert.equal(x.role, 'primary')
  // Y из группы — тоже primary (не перекрыт товаром)
  const y = eff.all.find((e) => e.code === 'Y')
  assert.equal(y.origin, 'group')
})

test('DoD#10 — дубли кодов схлопываются в effective profile', () => {
  const product = mkProduct('Горшок', ['A', 'B'])
  const group = { id: 'g', name: 'G', ktru: ktruListFromCodes(['A', 'B', 'C'], 'user'), createdAt: '', updatedAt: '' }
  const eff = effectiveKtruProfile(product, group)
  assert.deepEqual(effectiveKtruCodes(eff), ['A', 'B', 'C']) // ровно 3, без повторов, отсортированы
  assert.equal(eff.all.filter((e) => e.code === 'A').length, 1)
  assert.equal(eff.all.find((e) => e.code === 'A').origin, 'product')
  assert.equal(eff.all.find((e) => e.code === 'C').origin, 'group')
})

test('effectiveKtruProfile без группы — только КТРУ товара', () => {
  const eff = effectiveKtruProfile(mkProduct('Горшок', ['A', 'B']), null)
  assert.deepEqual(effectiveKtruCodes(eff), ['A', 'B'])
  assert.ok(eff.all.every((e) => e.origin === 'product'))
})

test('setGroupKtru / setGroupPrimaryKtru через стор', () => {
  reset()
  const st = useSmartKtru.getState()
  const gid = st.addGroup('Горшки')
  st.setGroupKtru(gid, [{ code: '222929.900.000114' }, { code: '236919.900.000010' }])
  let g = useSmartKtru.getState().getGroup(gid)
  assert.equal(g.ktru.find((k) => k.role === 'primary').code, '222929.900.000114')
  useSmartKtru.getState().setGroupPrimaryKtru(gid, '236919.900.000010')
  g = useSmartKtru.getState().getGroup(gid)
  assert.equal(g.ktru.find((k) => k.role === 'primary').code, '236919.900.000010')
})

test('removeGroup снимает groupId у товаров, товары остаются', () => {
  reset()
  const st = useSmartKtru.getState()
  const p1 = st.addProduct(mkProduct('Горшок 10', ['A']))
  const gid = st.createGroupWithProducts('G', [p1])
  assert.equal(useSmartKtru.getState().getProduct(p1).groupId, gid)
  useSmartKtru.getState().removeGroup(gid)
  assert.equal(useSmartKtru.getState().getProduct(p1).groupId, undefined)
  assert.ok(useSmartKtru.getState().getProduct(p1)) // товар не удалён
})

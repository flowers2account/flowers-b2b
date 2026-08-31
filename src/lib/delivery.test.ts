import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeDeliveryCost, INTERCITY_DELIVERY_PCT, DELIVERY_CITY } from './delivery'

test('computeDeliveryCost: самовывоз / способ не указан → 0', () => {
  assert.equal(computeDeliveryCost('pickup', 'Уральск', 2000, 50000, false), 0)
  assert.equal(computeDeliveryCost(null, 'Уральск', 2000, 50000, false), 0)
  assert.equal(computeDeliveryCost(undefined, 'Актобе', 2000, 50000, false), 0)
})

test('computeDeliveryCost: ПЕРВЫЙ заказ клиента → 0 (любой город)', () => {
  assert.equal(computeDeliveryCost('delivery', 'Уральск', 2000, 50000, true), 0)
  assert.equal(computeDeliveryCost('delivery', 'Актобе', 2000, 50000, true), 0)
  assert.equal(computeDeliveryCost('delivery', 'Атырау', 2000, 88750, true), 0)
})

test('computeDeliveryCost: повторный заказ, Уральск → фикс fee', () => {
  assert.equal(computeDeliveryCost('delivery', 'Уральск', 2000, 50000, false), 2000)
  assert.equal(computeDeliveryCost('delivery', ' Уральск ', 1500, 50000, false), 1500) // trim города
  assert.equal(computeDeliveryCost('delivery', DELIVERY_CITY, 3000, 0, false), 3000)
})

test('computeDeliveryCost: повторный заказ, межгород → 10% от суммы товаров', () => {
  assert.equal(computeDeliveryCost('delivery', 'Актобе', 2000, 88750, false), 8875)
  assert.equal(computeDeliveryCost('delivery', 'Атырау', 2000, 12345, false), Math.round(12345 * 0.1))
  assert.equal(INTERCITY_DELIVERY_PCT, 10)
})

test('computeDeliveryCost: isFirstOrder по умолчанию false → наценка применяется', () => {
  assert.equal(computeDeliveryCost('delivery', 'Уральск', 2000, 50000), 2000)
  assert.equal(computeDeliveryCost('delivery', 'Актобе', 2000, 50000), 5000)
})

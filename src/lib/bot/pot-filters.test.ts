import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractPotFilters, applyPotFilters, describePotFilters } from './pot-filters'

test('extractPotFilters: диаметр из "N см"', () => {
  assert.deepEqual(extractPotFilters('есть растение в горшке 12 см?'), { potDiameter: 12 })
  assert.deepEqual(extractPotFilters('есть монстера 14 см?'), { potDiameter: 14 })
})

test('extractPotFilters: цена из "до N"', () => {
  assert.deepEqual(extractPotFilters('покажи растения до 5000'), { maxPrice: 5000 })
  assert.deepEqual(extractPotFilters('покажи растения до 5000 ₸'), { maxPrice: 5000 })
})

test('extractPotFilters: количество из "N штук/одинаковых"', () => {
  assert.deepEqual(extractPotFilters('нужны 10 одинаковых спатифиллумов'), { minQty: 10 })
  assert.deepEqual(extractPotFilters('нужно 5 шт'), { minQty: 5 })
})

test('extractPotFilters: числа не путаются между собой', () => {
  // "12 см" не должно утечь в minQty, "10 одинаковых" не должно утечь в potDiameter.
  assert.deepEqual(extractPotFilters('нужно 10 одинаковых растений в горшке 12 см'), {
    potDiameter: 12,
    minQty: 10,
  })
})

test('extractPotFilters: без числовых условий — пусто', () => {
  assert.deepEqual(extractPotFilters('есть спатифиллум?'), {})
  assert.deepEqual(extractPotFilters('нужна большая драцена'), {})
  assert.deepEqual(extractPotFilters('покажи несколько вариантов для офиса'), {})
})

test('applyPotFilters: фильтрует по всем трём полям', () => {
  const rows = [
    { id: 1, price: 1640, qty: 69, pot_diameter: 12 },
    { id: 2, price: 5550, qty: 33, pot_diameter: 17 },
    { id: 3, price: 500, qty: 10, pot_diameter: 13 },
    { id: 4, price: 500, qty: 6, pot_diameter: 12 },
  ]
  assert.deepEqual(applyPotFilters(rows, { potDiameter: 12 }).map((r) => r.id), [1, 4])
  assert.deepEqual(applyPotFilters(rows, { maxPrice: 1000 }).map((r) => r.id), [3, 4])
  assert.deepEqual(applyPotFilters(rows, { minQty: 10 }).map((r) => r.id), [1, 2, 3])
  assert.deepEqual(applyPotFilters(rows, { potDiameter: 12, minQty: 10 }).map((r) => r.id), [1])
  assert.deepEqual(applyPotFilters(rows, {}).map((r) => r.id), [1, 2, 3, 4])
})

test('applyPotFilters: null-поля не проходят числовой фильтр', () => {
  const rows = [{ id: 1, price: null, qty: null, pot_diameter: null }]
  assert.deepEqual(applyPotFilters(rows, { maxPrice: 5000 }), [])
  assert.deepEqual(applyPotFilters(rows, { minQty: 1 }), [])
  assert.deepEqual(applyPotFilters(rows, { potDiameter: 12 }), [])
})

test('describePotFilters: человекочитаемый вывод', () => {
  assert.equal(describePotFilters({ potDiameter: 12 }), 'диаметр горшка 12 см')
  assert.equal(
    describePotFilters({ potDiameter: 12, minQty: 10, maxPrice: 5000 }),
    'диаметр горшка 12 см; остаток от 10 шт; цена до 5 000 ₸',
  )
})

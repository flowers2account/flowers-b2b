// Юнит-тесты rule-classifier.ts. Модуль без внешних зависимостей (Next.js/Supabase) —
// запускается напрямую нативным Node (Node 24+, без сборки): `node src/lib/bot/rule-classifier.test.ts`.
// В проекте нет test runner'а (jest/vitest) — используется встроенный node:test, чтобы
// не тащить новую зависимость ради нескольких проверок.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyByRules } from './rule-classifier'

// «Растение в горшке» — живое растение → pot, даже со словом «горшок»/«горшке» в тексте.
test('растение в горшке → pot', () => {
  assert.equal(classifyByRules('есть растение в горшке 12 см?')?.intent, 'pot')
  assert.equal(classifyByRules('нужно растение в горшке')?.intent, 'pot')
  assert.equal(classifyByRules('какие растения в горшках есть?')?.intent, 'pot')
})

// «Горшок» как товар (тара) — остаётся accessories, конструкция без «X в горшке».
test('горшок как товар → accessories (не сломано)', () => {
  assert.equal(classifyByRules('нужен горшок для растения')?.intent, 'accessories')
  assert.equal(classifyByRules('покажи горшки для растений')?.intent, 'accessories')
  assert.equal(classifyByRules('нужен горшок')?.intent, 'accessories')
  assert.equal(classifyByRules('есть кашпо?')?.intent, 'accessories')
})

// «Горшечные» (прилагательное) — не путается с «горшок» (тара).
test('горшечные растения → pot, не accessories', () => {
  const r = classifyByRules('покажите горшечные')
  assert.equal(r?.intent, 'pot')
  assert.deepEqual(r?.keywords, ['горшечные растения'])
})

// Именованные виды по-прежнему матчатся напрямую (rules, без похода в Gemini).
test('именованные виды → pot', () => {
  assert.equal(classifyByRules('есть спатифиллум?')?.intent, 'pot')
  assert.equal(classifyByRules('нужен фикус')?.intent, 'pot')
  assert.equal(classifyByRules('есть монстера 14 см?')?.intent, 'pot')
  assert.equal(classifyByRules('есть драцена?')?.intent, 'pot')
})

// Расходка без пересечения с pot-правилами.
test('прочая расходка не задета', () => {
  assert.equal(classifyByRules('нужна плёнка матовая')?.intent, 'accessories')
  assert.equal(classifyByRules('нужна упаковка')?.intent, 'accessories')
})

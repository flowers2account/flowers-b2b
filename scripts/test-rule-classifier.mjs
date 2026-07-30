import assert from 'node:assert/strict'
import { classifyByRules } from '../src/lib/bot/rule-classifier.ts'

const cases = [
  ['Есть красная атласная лента?', 'accessories'],
  ['Нужен фоамиран', 'accessories'],
  ['Покажи упаковку', 'accessories'],
  ['Здравствуйте', null],
  ['Как оформить заказ?', null],
  ['НуЖнА ПлЁнКа', 'accessories'],
  ['сообщение без товарных слов', null],
]

for (const [message, expectedIntent] of cases) {
  const result = classifyByRules(message)
  assert.equal(result?.intent ?? null, expectedIntent, message)
}

console.log(JSON.stringify({ passed: cases.length }))

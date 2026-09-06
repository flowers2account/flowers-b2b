// CLI умного поиска КТРУ.
//   npm run ktru:search -- "грунт для цветов"
//   node scripts/ktru-search.mjs "удобрение для комнатных растений" --limit=5 --json
//
// Ядро — чистая функция src/lib/ktru/search.ts (Node 24 стрипает типы на лету).

import { searchKtru } from '../src/lib/ktru/search.ts'

const args = process.argv.slice(2)
const flags = new Set(args.filter((a) => a.startsWith('--')))
const limitArg = args.find((a) => a.startsWith('--limit='))
const limit = limitArg ? Math.max(1, parseInt(limitArg.split('=')[1], 10) || 10) : 10
const query = args.filter((a) => !a.startsWith('--')).join(' ').trim()

if (!query) {
  console.error('Использование: npm run ktru:search -- "<запрос>"')
  process.exit(1)
}

const results = searchKtru(query, { limit })

if (flags.has('--json')) {
  console.log(JSON.stringify({ query, count: results.length, results }, null, 2))
  process.exit(0)
}

console.log(`\nЗапрос: ${query}\n`)
if (!results.length) {
  console.log('(ничего не найдено)\n')
  process.exit(0)
}
results.forEach((r, i) => {
  console.log(`${i + 1}. ${r.code}`)
  console.log(`   ${r.nameRu}`)
  console.log(`   Score: ${r.score.toFixed(2)}`)
  console.log(`   Причины:`)
  r.reasons.forEach((x) => console.log(`   - ${x}`))
  console.log()
})

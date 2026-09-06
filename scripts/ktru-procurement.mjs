// CLI слоя «КТРУ → закупки»: для одного кода (или текстового запроса, который сначала
// резолвится через searchKtru) тянет живые данные из GraphQL V3 и печатает сводку.
//
//   node --env-file=.env.local scripts/ktru-procurement.mjs "грунт"
//   node --env-file=.env.local scripts/ktru-procurement.mjs --code=081212.119.000010
//   node --env-file=.env.local scripts/ktru-procurement.mjs "удобрение" --year=2026
//   node --env-file=.env.local scripts/ktru-procurement.mjs "пластиковый горшок" --all-years --json
//
// Требует GOSZAKUP_TOKEN в .env.local (см. src/lib/goszakup/client.ts).

import { searchKtru } from '../src/lib/ktru/search.ts'
import { getKtruProcurement } from '../src/lib/ktru/procurement.ts'

const args = process.argv.slice(2)
const flags = new Set(args.filter((a) => a.startsWith('--')))
const codeArg = args.find((a) => a.startsWith('--code='))
const yearArg = args.find((a) => a.startsWith('--year='))
const query = args.filter((a) => !a.startsWith('--')).join(' ').trim()

const CODE_RE = /^\d{6}\.\d{3}\.\d{6}$/

async function resolveCode() {
  if (codeArg) {
    const code = codeArg.slice('--code='.length)
    if (!CODE_RE.test(code)) {
      console.error(`--code="${code}" не похож на код КТРУ (ожидается NNNNNN.NNN.NNNNNN)`)
      process.exit(1)
    }
    return { code, via: 'explicit', score: null }
  }
  if (!query) {
    console.error('Использование: node --env-file=.env.local scripts/ktru-procurement.mjs "<запрос>" | --code=<код>')
    process.exit(1)
  }
  if (CODE_RE.test(query)) return { code: query, via: 'explicit', score: null }
  const results = searchKtru(query, { limit: 1 })
  if (!results.length) {
    console.error(`По запросу «${query}» в локальном индексе ничего не найдено (data/enstru/enstru_index.json).`)
    process.exit(1)
  }
  return { code: results[0].code, via: 'search', score: results[0].score, nameRu: results[0].nameRu }
}

function money(n) {
  return Math.round(n).toLocaleString('ru-RU') + ' ₸'
}

async function main() {
  const resolved = await resolveCode()
  // В --json держим stdout чистым JSON'ом — статус резолва пишем в stderr в обоих режимах,
  // в человекочитаемом режиме он там же виден в терминале.
  if (resolved.via === 'search') {
    console.error(`Запрос: "${query}" → КТРУ ${resolved.code} «${resolved.nameRu}» (score ${resolved.score.toFixed(2)})`)
  } else {
    console.error(`КТРУ: ${resolved.code}`)
  }

  const year = flags.has('--all-years') ? 'all' : yearArg ? parseInt(yearArg.slice('--year='.length), 10) : undefined

  const verbose = flags.has('--verbose')
  const summary = await getKtruProcurement(resolved.code, {
    year,
    onProgress: verbose ? (m) => process.stderr.write('  ' + m + '\r') : undefined,
  })
  if (verbose) process.stderr.write('\n')

  if (flags.has('--json')) {
    console.log(JSON.stringify(summary, null, 2))
    return
  }

  console.log(`Наименование: ${summary.nameRu}`)
  console.log(`Год: ${summary.year === 'all' ? 'все' : summary.year}`)
  console.log()
  console.log(
    `Пунктов плана: ${summary.plansTotalCount} (по API)` +
      (summary.plansFetched !== summary.plansTotalCount || summary.plansTruncated
        ? `, обработано ${summary.plansFetched}${summary.plansTruncated ? ' [ОБРЕЗАНО лимитом --max-plans]' : ''}`
        : ''),
  )
  console.log(`  плановая сумма (Plans.amount): ${money(summary.plansTotalAmount)}`)
  console.log(`  заказчиков на стороне плана: ${summary.plansDistinctCustomers}`)
  console.log()
  console.log(`Лотов (по этим пунктам плана): ${summary.lotsTotalFetched}${summary.lotsTruncated ? ' [ОБРЕЗАНО лимитом --max-lots]' : ''}`)
  console.log(`  сумма по всем лотам: ${money(summary.lotsTotalAmount)}`)
  console.log(`  из них АКТИВНЫХ (статусы ${summary.activeLotStatuses.join(',')}): ${summary.activeLotsCount}`)
  console.log(`  сумма по активным лотам: ${money(summary.activeLotsTotalAmount)}`)
  console.log()
  console.log(`Регионов (КАТО), всего различных: ${summary.regionsDistinct}`)
  for (const r of summary.regions) console.log(`  ${r.kato.padEnd(14)} лотов: ${r.lots}  сумма: ${money(r.amount)}`)
  console.log()
  console.log(`Заказчиков, всего различных (по лотам): ${summary.customersDistinct}`)
  for (const c of summary.customers) {
    const name = c.nameRu.length > 70 ? c.nameRu.slice(0, 70) + '…' : c.nameRu
    console.log(`  ${c.bin}  лотов: ${c.lots}  сумма: ${money(c.amount)}  — ${name}`)
  }
  console.log()
  console.log(`Даты публикации закупок: ${summary.dateRange.minPublish ?? '—'} … ${summary.dateRange.maxPublish ?? '—'}`)
  console.log()
  if (summary.activeLotSamples.length) {
    const today = new Date().toISOString().slice(0, 10)
    console.log(`Активные лоты по возрастанию срока окончания приёма заявок (топ ${summary.activeLotSamples.length}):`)
    for (const l of summary.activeLotSamples) {
      const overdue = l.endDate && l.endDate.slice(0, 10) < today ? '  [срок по данным реестра уже прошёл]' : ''
      console.log(
        `  ${l.trdBuyNumberAnno.padEnd(14)} до ${l.endDate ?? '—'}  ${money(l.amount)}  status=${l.refLotStatusId}  ${l.nameRu}${overdue}`,
      )
    }
  } else {
    console.log('Активных лотов не найдено.')
  }
}

main().catch((e) => {
  console.error('Ошибка:', e.message)
  process.exit(1)
})

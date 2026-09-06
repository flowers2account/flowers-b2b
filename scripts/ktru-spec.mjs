// CLI: получить техническую спецификацию одного лота.
//   node --env-file=.env.local scripts/ktru-spec.mjs --lot=43107714
//   node --env-file=.env.local scripts/ktru-spec.mjs --lot=43107714 --json
//   node --env-file=.env.local scripts/ktru-spec.mjs --lot=43107714 --save   (сохранить пример в data/procurement/spec-examples/)
//
// Требует GOSZAKUP_TOKEN в .env.local (см. src/lib/goszakup/client.ts). Скачивание
// самого PDF токена не требует — ссылка из filePath публичная (проверено).

import fs from 'node:fs'
import path from 'node:path'
import {
  getLotContextRaw,
  pickTechSpecFile,
  downloadFile,
  extractPdfText,
  parseTechSpecTable,
  toTechnicalSpecification,
} from '../src/lib/goszakup/spec.ts'

const args = process.argv.slice(2)
const flags = new Set(args.filter((a) => a.startsWith('--')))
const lotArg = args.find((a) => a.startsWith('--lot='))
if (!lotArg) {
  console.error('Использование: node --env-file=.env.local scripts/ktru-spec.mjs --lot=<LOT_ID> [--json] [--save]')
  process.exit(1)
}
const lotId = parseInt(lotArg.slice('--lot='.length), 10)

function money(n) {
  return n == null ? '—' : Math.round(n).toLocaleString('ru-RU') + ' ₸'
}

async function main() {
  const { ctx, raw } = await getLotContextRaw(lotId)
  if (!ctx) {
    console.error(`Лот ${lotId} не найден (Lots(filter:{id:[${lotId}]}) — пусто).`)
    process.exit(1)
  }

  console.error(`LOT: ${ctx.lotId} (${ctx.lotNumber ?? '—'})`)
  console.error(`BUY: ${ctx.buyId ?? '—'} (${ctx.buyNumberAnno ?? '—'})`)
  console.error(`Пункты плана: ${ctx.pointList.join(', ') || '—'}`)
  console.error(`Название: ${ctx.nameRu ?? '—'} — ${ctx.descriptionRu ?? '—'}`)
  console.error(`Количество: ${ctx.count ?? '—'}`)
  console.error(`Сумма лота: ${money(ctx.amount)}`)
  console.error(`Заказчик: ${ctx.customerBin ?? '—'} — ${ctx.customerNameRu ?? '—'}`)
  console.error(`Статус лота: ${ctx.refLotStatusId ?? '—'}`)
  console.error(`Файлов на лоте: ${ctx.lotFiles.length}, на объявлении: ${ctx.buyFiles.length}`)
  console.error()

  const file = pickTechSpecFile(ctx.lotFiles) ?? pickTechSpecFile(ctx.buyFiles)
  if (!file) {
    console.error('Техническая спецификация: НЕДОСТУПНА через API (нет прикреплённого файла с таким названием).')
    console.error(`Официальная страница лота: https://goszakup.gov.kz/ru/announce/index/${ctx.buyId ?? ''}`)
    if (flags.has('--json')) console.log(JSON.stringify({ lotId: String(lotId), source: null, error: 'no techspec file' }))
    return
  }

  console.error(`Найден файл: "${file.nameRu}" (${file.originalName}) → ${file.filePath}`)
  const pdfBuf = await downloadFile(file.filePath)
  const { text, numpages } = await extractPdfText(pdfBuf)
  const rows = parseTechSpecTable(text)
  const spec = toTechnicalSpecification({ lotId: ctx.lotId, buyId: ctx.buyId, file, rawText: text, numpages, rows })

  if (flags.has('--save')) {
    const dir = path.join(process.cwd(), 'data', 'procurement', 'spec-examples')
    fs.mkdirSync(dir, { recursive: true })
    const base = `lot-${ctx.lotId}`
    fs.writeFileSync(path.join(dir, `${base}.pdf`), pdfBuf)
    // Сырой ответ GraphQL как есть (никакого токена/заголовков в теле ответа нет —
    // Authorization уходит только в запросе, в JSON-ответе его физически не может быть).
    fs.writeFileSync(path.join(dir, `${base}-graphql-raw-response.json`), JSON.stringify(raw, null, 2))
    fs.writeFileSync(path.join(dir, `${base}-graphql-lot-parsed.json`), JSON.stringify(ctx, null, 2))
    fs.writeFileSync(path.join(dir, `${base}-extracted-text.txt`), text)
    fs.writeFileSync(path.join(dir, `${base}-normalized.json`), JSON.stringify(spec, null, 2))
    console.error(`\nСохранено в ${dir} (${base}.pdf, *-graphql-lot.json, *-extracted-text.txt, *-normalized.json)`)
  }

  if (flags.has('--json')) {
    console.log(JSON.stringify(spec, null, 2))
    return
  }

  console.log('Техническая спецификация:')
  console.log(`  документ: ${spec.documentTitle} (${spec.originalFileName}), ${spec.numpages} стр.`)
  console.log(`  ссылка: ${spec.source}`)
  console.log()
  console.log('Характеристики:')
  if (spec.characteristics?.length) {
    for (const c of spec.characteristics) {
      const unit = c.unit ? ` [${c.unit}]` : ''
      console.log(`- ${c.name}: ${c.value}${unit}`)
    }
  } else {
    console.log('  (шаблон не распознан — см. rawText в --json)')
  }
}

main().catch((e) => {
  console.error('Ошибка:', e.message)
  process.exit(1)
})

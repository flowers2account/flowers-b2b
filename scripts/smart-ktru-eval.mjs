// Проверка универсальности AI-разбора ТС на реальных лотах разных категорий.
//   node --env-file=.env.local scripts/smart-ktru-eval.mjs
// Для каждой категории: находит живой лот с ТС, гоняет полный analyzeLot,
// сохраняет извлечение в data/smart-ktru/eval/<slug>.json и печатает сводку.

import fs from 'node:fs'
import path from 'node:path'
import { gql } from '../src/lib/goszakup/client.ts'
import { analyzeLot } from '../src/lib/smart-ktru/analyze.ts'

const OUT = path.join(process.cwd(), 'data', 'smart-ktru', 'eval')
fs.mkdirSync(OUT, { recursive: true })

// категория → (КТРУ, демо-товар для сравнения)
const CASES = [
  {
    slug: 'gorshok-plastik', ktru: '222929.900.000114',
    product: { name: 'Горшок пластиковый', costPerUnit: 3600, characteristics: [
      { name: 'Материал', value: 'полипропилен' }, { name: 'Диаметр', value: '30', unit: 'см' },
      { name: 'Высота', value: '25', unit: 'см' }, { name: 'Цвет', value: 'зелёный' } ] },
  },
  {
    slug: 'grunt', ktru: '081212.119.000010',
    product: { name: 'Грунт универсальный', costPerUnit: 1400, characteristics: [
      { name: 'Тип удобрения', value: 'минеральное' }, { name: 'Форма выпуска', value: 'брикет' },
      { name: 'pH', value: '6.0' }, { name: 'Органическое вещество', value: '75', unit: '%' } ] },
  },
  {
    slug: 'udobrenie', ktru: '201539.900.000000',
    product: { name: 'Удобрение универсальное', costPerUnit: 900, characteristics: [
      { name: 'Тип', value: 'минеральное' }, { name: 'Назначение', value: 'для комнатных растений' } ] },
  },
  {
    slug: 'rastenie', ktru: '013010.200.000000',
    product: { name: 'Растение комнатное', costPerUnit: 2500, characteristics: [
      { name: 'Тип', value: 'декоративно-лиственное' }, { name: 'Высота', value: '40', unit: 'см' } ] },
  },
  {
    slug: 'sazhenec', ktru: '021011.200.000000',
    product: { name: 'Саженец дерева', costPerUnit: 1800, characteristics: [
      { name: 'Возраст', value: '2', unit: 'года' }, { name: 'Высота', value: '120', unit: 'см' } ] },
  },
  {
    slug: 'bukety', ktru: '011921.900.000000',
    product: { name: 'Букет живых цветов', costPerUnit: 5000, characteristics: [
      { name: 'Состав', value: 'розы' }, { name: 'Количество цветов', value: '15', unit: 'шт' } ] },
  },
]

async function findLotWithSpec(ktru) {
  const p = await gql(`{ Plans(filter:{refEnstruCode:"${ktru}", plnPointYear:[2026]}, limit:150){ id } }`)
  const ids = (p.data?.Plans ?? []).map((x) => x.id)
  if (!ids.length) return null
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100)
    const l = await gql(
      `{ Lots(filter:{pointList:[${chunk.join(',')}], refLotStatusId:[210,220,230,240,245,250]}, limit:60){ id Files{ nameRu originalName } TrdBuy{ Files{ nameRu originalName } } } }`,
    )
    const hit = (l.data?.Lots ?? []).find(
      (x) =>
        (x.Files ?? []).some((f) => /техническ/i.test(f.nameRu ?? '') || /techspec/i.test(f.originalName ?? '')) ||
        (x.TrdBuy?.Files ?? []).some((f) => /техническ/i.test(f.nameRu ?? '')),
    )
    if (hit) return hit.id
  }
  return null
}

const summary = []
for (const c of CASES) {
  process.stderr.write(`\n### ${c.slug} (${c.ktru})\n`)
  let lotId
  try {
    lotId = await findLotWithSpec(c.ktru)
  } catch (e) {
    process.stderr.write(`  поиск лота упал: ${e.message}\n`)
  }
  if (!lotId) {
    summary.push({ slug: c.slug, ktru: c.ktru, lotId: null, note: 'живой лот с ТС не найден' })
    continue
  }
  const product = { id: 'eval-' + c.slug, ...c.product, ktruCodes: [c.ktru], createdAt: '', updatedAt: '' }
  try {
    const r = await analyzeLot({ lotId, product, ktruCode: c.ktru, taxRatio: 0.03, taxLabel: 'УСН 3%' })
    const rec = {
      slug: c.slug, ktru: c.ktru, lotId, lotName: r.facts.nameRu, buyNumber: r.facts.buyNumberAnno,
      specFile: r.facts.specFile?.originalName ?? null,
      spec: r.spec, match: r.match ? {
        total: r.match.total, matched: r.match.matched, mismatched: r.match.mismatched,
        pending: r.match.pending, criticalMismatches: r.match.criticalMismatches,
        rows: r.match.rows.map((x) => ({ name: x.requirement.name, type: x.requirement.requirementType, ts: x.requirement.value, product: x.productValue, verdict: x.verdict, critical: x.critical })),
      } : null,
      economics: { marginRatio: r.economics.marginRatio, usesHistoricalPrice: r.economics.usesHistoricalPrice, basis: r.economics.unitPriceBasis },
      score: { participationIndex: r.score.participationIndex, verdict: r.score.verdict, summary: r.score.summary },
      warnings: r.warnings,
      specTextExcerpt: (r.specText ?? '').slice(0, 1500),
    }
    fs.writeFileSync(path.join(OUT, `${c.slug}.json`), JSON.stringify(rec, null, 2))
    const s = r.spec
    process.stderr.write(
      `  lot ${lotId} | ТС: ${s ? s.meta.method + ', ' + s.characteristics.length + ' req, tmpl=' + s.meta.templateRecognized : 'нет'}` +
        ` | match ${r.match ? `${r.match.matched}/${r.match.total} (крит ${r.match.criticalMismatches})` : '—'}` +
        ` | ${r.score.participationIndex}/100 ${r.score.verdict}\n`,
    )
    ;(s?.characteristics ?? []).forEach((x) =>
      process.stderr.write(`    · ${x.name} = ${x.value ?? '—'}${x.unit ? ' ' + x.unit : ''} [${x.requirementType}] conf ${x.confidence ?? '?'}\n`),
    )
    summary.push({ slug: c.slug, ktru: c.ktru, lotId, reqCount: s?.characteristics.length ?? 0, method: s?.meta.method ?? 'none', verdict: r.score.verdict })
  } catch (e) {
    process.stderr.write(`  analyze упал: ${e.message}\n`)
    summary.push({ slug: c.slug, ktru: c.ktru, lotId, note: 'analyze error: ' + e.message })
  }
}

fs.writeFileSync(path.join(OUT, '_summary.json'), JSON.stringify(summary, null, 2))
console.log('\n=== EVAL SUMMARY ===')
console.log(JSON.stringify(summary, null, 2))
console.log(`\nфайлы: ${OUT}`)

// Детерминированное сопоставление товара с требованиями ТС.
// Тип ограничения решает всё: «≥25 / товар 20» → mismatch, «20-30 / товар 25» → match.
// Никакого LLM здесь — только парсинг чисел, нормализация единиц и правила по типу.

import type {
  Product,
  ProductCharacteristic,
  SpecRequirement,
  MatchRow,
  MatchResult,
  MatchVerdict,
} from './types.ts'

// ─────────────────── нормализация текста ───────────────────

export function normText(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}\s.,-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Базовые синонимы значений — намеренно маленький список, расширяемый.
const VALUE_SYNONYMS: Record<string, string[]> = {
  // полипропилен/полиэтилен/ПВХ — частные случаи «пластика»: требование «пластик»
  // считается выполненным полипропиленовым товаром.
  пластик: [
    'пластиковый', 'пластмасса', 'пластмассовый', 'пластика',
    'полипропилен', 'пп', 'pp', 'полипропиленовый', 'полипропилена',
    'полиэтилен', 'полиэтиленовый', 'пнд', 'пвд', 'hdpe', 'ldpe',
    'пвх', 'поливинилхлорид', 'полистирол', 'абс', 'abs',
  ],
  керамика: ['керамический', 'керамzиka', 'керамический материал', 'керамики'],
  металл: ['металлический', 'сталь', 'стальной', 'металла'],
  зеленый: ['зелёный', 'green', 'зеленого', 'зелёного'],
  белый: ['white', 'белого'],
  черный: ['чёрный', 'black', 'черного'],
  минеральное: ['минеральный', 'минеральные'],
}

function canonValue(v: string): string {
  const n = normText(v)
  for (const [canon, alts] of Object.entries(VALUE_SYNONYMS)) {
    if (n === canon || alts.includes(n)) return canon
  }
  return n
}

// ─────────────────── нормализация единиц ───────────────────

// приводим к базовой единице внутри «семейства», множитель к базовой
const UNIT_FACTORS: Record<string, { base: string; k: number }> = {
  мм: { base: 'мм', k: 1 },
  см: { base: 'мм', k: 10 },
  дм: { base: 'мм', k: 100 },
  м: { base: 'мм', k: 1000 },
  мл: { base: 'мл', k: 1 },
  л: { base: 'мл', k: 1000 },
  г: { base: 'г', k: 1 },
  кг: { base: 'г', k: 1000 },
  '%': { base: '%', k: 1 },
  шт: { base: 'шт', k: 1 },
}

function normUnit(u: string | null | undefined): string {
  return normText(u).replace(/\.$/, '')
}

/** Приводит (value, unit) к базовой единице семейства. Возвращает null, если не число. */
function toBase(value: number, unit: string | null | undefined): { v: number; base: string } | null {
  if (!Number.isFinite(value)) return null
  const u = normUnit(unit)
  const f = UNIT_FACTORS[u]
  if (f) return { v: value * f.k, base: f.base }
  return { v: value, base: u || '' } // безразмерное / незнакомая единица — сравниваем как есть
}

// ─────────────────── парсинг чисел из строк ───────────────────

function num(s: string): number | null {
  const m = s.replace(',', '.').match(/-?\d+(\.\d+)?/)
  return m ? parseFloat(m[0]) : null
}

export interface ParsedConstraint {
  kind: 'exact' | 'min' | 'max' | 'range' | 'none'
  a?: number
  b?: number
}

/**
 * Разбирает строку требования в числовое ограничение, опираясь и на requirementType,
 * и на сам текст («не менее 25», «≥ 25», «20-30», «до 25»).
 */
export function parseConstraint(raw: string, declaredType: string): ParsedConstraint {
  const s = normText(raw).replace(/–|—|−/g, '-')

  // диапазон: "20-30", "от 20 до 30"
  const range = s.match(/(-?\d+(?:\.\d+)?)\s*(?:-|до)\s*(-?\d+(?:\.\d+)?)/)
  if (range && declaredType !== 'exact') {
    const a = parseFloat(range[1])
    const b = parseFloat(range[2])
    return { kind: 'range', a: Math.min(a, b), b: Math.max(a, b) }
  }

  const hasMin = /не менее|не ниже|от\s|минимум|≥|>=|больше или равно/.test(s)
  const hasMax = /не более|не выше|до\s|максимум|≤|<=|меньше или равно/.test(s)
  const n = num(s)

  if (declaredType === 'min' || (declaredType !== 'max' && hasMin && !hasMax)) {
    return n != null ? { kind: 'min', a: n } : { kind: 'none' }
  }
  if (declaredType === 'max' || (hasMax && !hasMin)) {
    return n != null ? { kind: 'max', a: n } : { kind: 'none' }
  }
  if (declaredType === 'range' && n != null) return { kind: 'range', a: n, b: n }
  if (n != null && (declaredType === 'exact' || declaredType === 'text')) {
    return { kind: 'exact', a: n }
  }
  return { kind: 'none' }
}

// ─────────────────── подбор характеристики товара ───────────────────

function findProductChar(
  product: Product,
  reqName: string,
): ProductCharacteristic | undefined {
  const rn = normText(reqName)
  // 1) точное совпадение имени
  let hit = product.characteristics.find((c) => normText(c.name) === rn)
  if (hit) return hit
  // 2) вхождение (диаметр ⊂ «диаметр горлышка»)
  hit = product.characteristics.find(
    (c) => normText(c.name).includes(rn) || rn.includes(normText(c.name)),
  )
  if (hit) return hit
  // 3) типовые алиасы
  const ALIASES: Record<string, string[]> = {
    материал: ['состав', 'изготовлен из', 'сырье'],
    цвет: ['окраска', 'расцветка'],
    диаметр: ['диаметр верхний', 'd'],
    высота: ['h', 'глубина'],
    'тип удобрения': ['вид удобрения', 'тип'],
  }
  for (const [canon, alts] of Object.entries(ALIASES)) {
    if (rn === canon || rn.includes(canon)) {
      hit = product.characteristics.find((c) =>
        [canon, ...alts].some((a) => normText(c.name).includes(a)),
      )
      if (hit) return hit
    }
  }
  return undefined
}

// ─────────────────── ядро сопоставления одной строки ───────────────────

function compareNumeric(
  reqRaw: string,
  reqType: string,
  reqUnit: string | null | undefined,
  prodValueNum: number,
  prodUnit: string | null | undefined,
): { verdict: MatchVerdict; explanation: string } {
  const c = parseConstraint(reqRaw, reqType)
  const reqBaseA =
    c.a != null ? toBase(c.a, reqUnit)?.v ?? c.a : undefined
  const reqBaseB =
    c.b != null ? toBase(c.b, reqUnit)?.v ?? c.b : undefined
  const prodBase = toBase(prodValueNum, prodUnit)?.v ?? prodValueNum

  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2))

  switch (c.kind) {
    case 'min':
      return prodBase >= (reqBaseA as number)
        ? { verdict: 'match', explanation: `требуется ≥ ${fmt(c.a!)}, у товара ${fmt(prodValueNum)} — проходит` }
        : { verdict: 'mismatch', explanation: `требуется ≥ ${fmt(c.a!)}, у товара ${fmt(prodValueNum)} — не проходит` }
    case 'max':
      return prodBase <= (reqBaseA as number)
        ? { verdict: 'match', explanation: `требуется ≤ ${fmt(c.a!)}, у товара ${fmt(prodValueNum)} — проходит` }
        : { verdict: 'mismatch', explanation: `требуется ≤ ${fmt(c.a!)}, у товара ${fmt(prodValueNum)} — не проходит` }
    case 'range':
      return prodBase >= (reqBaseA as number) && prodBase <= (reqBaseB as number)
        ? { verdict: 'match', explanation: `диапазон ${fmt(c.a!)}–${fmt(c.b!)}, у товара ${fmt(prodValueNum)} — в диапазоне` }
        : { verdict: 'mismatch', explanation: `диапазон ${fmt(c.a!)}–${fmt(c.b!)}, у товара ${fmt(prodValueNum)} — вне диапазона` }
    case 'exact':
      return Math.abs(prodBase - (reqBaseA as number)) < 1e-6
        ? { verdict: 'match', explanation: `требуется ровно ${fmt(c.a!)}, совпадает` }
        : { verdict: 'mismatch', explanation: `требуется ровно ${fmt(c.a!)}, у товара ${fmt(prodValueNum)}` }
    default:
      return { verdict: 'pending', explanation: 'числовое ограничение не распознано — проверьте вручную' }
  }
}

function isCritical(req: SpecRequirement, verdict: MatchVerdict): boolean {
  if (verdict !== 'mismatch') return false
  if (req.requirementType === 'document' || req.requirementType === 'presence') return true
  if (req.requirementType === 'exact') return true
  // жёсткие числовые min/max/range тоже критичны
  if (['min', 'max', 'range'].includes(req.requirementType)) return true
  return false // text-несоответствие считаем некритичным (возможен допуск)
}

export function matchRequirement(product: Product, req: SpecRequirement): MatchRow {
  const base = (verdict: MatchVerdict, explanation: string, pv?: string | null, pu?: string | null): MatchRow => ({
    requirement: req,
    productValue: pv ?? null,
    productUnit: pu ?? null,
    verdict,
    critical: isCritical(req, verdict),
    explanation,
  })

  // документы / наличие — товар должен иметь соответствующий признак-характеристику
  if (req.requirementType === 'document' || req.requirementType === 'presence') {
    const want = normText(req.value || req.name || req.rawRequirement)
    const has = product.characteristics.find((c) => {
      const cn = normText(c.name)
      const cv = normText(c.value)
      return (
        (cn.includes(want) || want.includes(cn)) &&
        (cv === '' || ['да', 'есть', 'yes', 'true', '1'].includes(cv) || cv.length > 0)
      ) || cv.includes(want)
    })
    if (has) return base('match', `у товара отмечено: «${has.name}${has.value ? ': ' + has.value : ''}»`, has.value)
    return base('pending', 'товар не содержит данных о требуемом документе/признаке — подтвердите наличие')
  }

  const pc = findProductChar(product, req.name)
  if (!pc || (pc.value == null || pc.value === '')) {
    return base('pending', `в товаре нет характеристики «${req.name}» — ожидает подтверждения`)
  }

  // числовое требование?
  const constraint = parseConstraint(req.rawRequirement || req.value || '', req.requirementType)
  const prodNum = num(pc.value)
  if (constraint.kind !== 'none' && prodNum != null) {
    const r = compareNumeric(req.rawRequirement || req.value || '', req.requirementType, req.unit, prodNum, pc.unit)
    return base(r.verdict, r.explanation, pc.value, pc.unit)
  }

  // текстовое / из списка
  const reqVals = String(req.value ?? req.rawRequirement ?? '')
    .split(/[,;/]| или | и /i)
    .map(canonValue)
    .filter(Boolean)
  const pv = canonValue(pc.value)
  if (reqVals.length === 0) {
    return base('pending', 'формулировка требования нечисловая и без явного значения — проверьте вручную', pc.value)
  }
  const ok = reqVals.some((rv) => rv === pv || rv.includes(pv) || pv.includes(rv))
  return ok
    ? base('match', `значение «${pc.value}» соответствует требованию`, pc.value, pc.unit)
    : base('mismatch', `требуется «${reqVals.join(' / ')}», у товара «${pc.value}»`, pc.value, pc.unit)
}

export function matchProductToSpec(
  product: Product,
  requirements: SpecRequirement[],
): MatchResult {
  const rows = requirements.map((r) => matchRequirement(product, r))
  const matched = rows.filter((r) => r.verdict === 'match').length
  const mismatched = rows.filter((r) => r.verdict === 'mismatch').length
  const pending = rows.filter((r) => r.verdict === 'pending').length
  const criticalMismatches = rows.filter((r) => r.critical).length
  const comparable = matched + mismatched
  // сортировка: критичные mismatch → mismatch → pending → match
  const order: Record<MatchVerdict, number> = { mismatch: 0, pending: 1, match: 2, 'not-a-requirement': 3 }
  rows.sort((a, b) => {
    if (a.critical !== b.critical) return a.critical ? -1 : 1
    return order[a.verdict] - order[b.verdict]
  })
  return {
    rows,
    total: rows.length,
    matched,
    mismatched,
    pending,
    criticalMismatches,
    ratio: comparable > 0 ? matched / comparable : 0,
  }
}

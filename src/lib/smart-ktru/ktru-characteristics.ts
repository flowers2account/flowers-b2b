// Агрегация «повторяющихся базовых характеристик» по КОДУ КТРУ.
//
// Конвейер (см. §18 ТЗ — этапы разделены, единого мега-промпта нет):
//   1. сбор лотов по КТРУ           → getKtruProcurement (существующий слой)
//   2. поиск файла ТС у лота        → getLotContext + pickTechSpecFile (существующий)
//   3. PDF → текст → характеристики → extractSpecification (существующий Gemini-слой)
//   4. нормализация названий        → normalizeCharName (детерминированно, здесь)
//   5. агрегация частоты            → aggregateCharacteristics (чистая, тестируемая)
//   6. разбиение на уровни          → threshold main/additional (настраиваемый)
//
// AI НЕ придумывает характеристики: в результат попадает только то, что реально
// встретилось в ТЗ, с provenance (frequency / examples / rawNames).

import { getKtruProcurement } from '../ktru/procurement.ts'
import { getLotContext, pickTechSpecFile, downloadFile, extractPdfText } from '../goszakup/spec.ts'
import { extractSpecification } from './spec-extract.ts'

export const ANALYZER_VERSION = 'v1'

export interface AggregatedCharacteristic {
  /** каноническое имя после нормализации */
  name: string
  /** в скольких ТЗ встретилась */
  frequency: number
  /** всего проанализировано ТЗ */
  totalSpecs: number
  /** frequency / totalSpecs, 0..1 */
  confidence: number
  level: 'main' | 'additional'
  /** до 5 различных примеров значений из реальных ТЗ */
  examples: string[]
  /** исходные формулировки, слитые в это имя */
  rawNames: string[]
  /** самая частая единица измерения, если есть */
  unit?: string
}

export interface KtruCharacteristicsResult {
  ktruCode: string
  analyzerVersion: string
  /** лотов найдено по КТРУ */
  lotsFound: number
  /** из них с приложенным файлом ТС */
  specsAvailable: number
  /** реально разобрано ТЗ (≥1 характеристика) */
  specsExtracted: number
  /** == specsExtracted, отдельное поле для наглядности в UI */
  analyzedSpecs: number
  characteristics: AggregatedCharacteristic[]
  notes: string[]
  generatedAt: string
}

export interface BuildOptions {
  /** порог «основной» характеристики (доля ТЗ). По умолчанию 0.5 */
  mainThreshold?: number
  /** минимальный порог для попадания в результат. По умолчанию 0.2 */
  minThreshold?: number
  /** сколько лотов максимум зондировать на наличие ТС */
  maxLotProbe?: number
  /** сколько ТЗ максимум разобрать (важно: не качать сотни PDF) */
  maxSpecs?: number
  /** таймаут на один файл (download + pdf + AI), мс */
  perFileTimeoutMs?: number
  /** параллелизм */
  concurrency?: number
  onProgress?: (done: number, total: number) => void
}

// ─────────────────────── нормализация названий (§7) ───────────────────────

// «шумовые» слова/хвосты, которые не меняют смысл характеристики
const QUALIFIER_WORDS = [
  'изготовления', 'изготовление', 'изделия', 'изделие', 'товара', 'продукции',
  'корпуса', 'корпус', 'основы', 'по', 'основной', 'номинальный', 'номинальная',
]

// каноническая карта: любой вариант слева → имя справа.
// Вход уже lower-case и ё→е, поэтому классы — [а-я] (НЕ \w: он не покрывает кириллицу).
const L = '[а-я]'
const CANON: Array<{ canon: string; variants: RegExp }> = [
  { canon: 'Материал', variants: new RegExp(`^(материал|материал\\s+изготовлени${L}*|материал\\s+корпус${L}*|материал\\s+издели${L}*|изготовлен${L}*\\s+из|из\\s+чего\\s+изготовл${L}+|состав\\s+материал${L}*|сырье)$`) },
  { canon: 'Диаметр', variants: new RegExp(`^(диаметр${L}*|диаметр\\s+издели${L}*|размер\\s+по\\s+диаметру|[ø⌀])$`) },
  { canon: 'Высота', variants: new RegExp(`^(высот${L}+|высота\\s+издели${L}*)$`) },
  { canon: 'Ширина', variants: new RegExp(`^(ширин${L}+)$`) },
  { canon: 'Длина', variants: new RegExp(`^(длин${L}+)$`) },
  { canon: 'Толщина', variants: new RegExp(`^(толщин${L}+|толщина\\s+стенк${L}*)$`) },
  { canon: 'Объём', variants: new RegExp(`^(объ[её]м${L}*|обьем${L}*|вместимост${L}+|емкост${L}+)$`) },
  { canon: 'Вес', variants: new RegExp(`^(вес|масс${L}+|вес\\s+нетто|масса\\s+нетто)$`) },
  { canon: 'Цвет', variants: new RegExp(`^(цвет${L}*|цветовое\\s+решени${L}*|окраск${L}+|расцветк${L}+)$`) },
  { canon: 'Форма', variants: new RegExp(`^(форм${L}+|форма\\s+издели${L}*|форма\\s+выпуск${L}*)$`) },
  { canon: 'Тип', variants: new RegExp(`^(тип${L}*|вид${L}*|разновидност${L}+)$`) },
  { canon: 'Назначение', variants: new RegExp(`^(назначени${L}*|общее\\s+назначени${L}*|область\\s+применени${L}*|применени${L}*)$`) },
  { canon: 'Размер', variants: new RegExp(`^(размер${L}*|габарит${L}*|габаритные\\s+размер${L}*)$`) },
  { canon: 'Страна происхождения', variants: new RegExp(`^(страна\\s+происхождени${L}*|страна[-\\s]изготовител${L}*|страна[-\\s]производител${L}*|производител${L}+|изготовител${L}+)$`) },
  { canon: 'Комплектация', variants: new RegExp(`^(комплектност${L}+|комплектаци${L}+|состав\\s+комплект${L}*)$`) },
  { canon: 'Плотность', variants: new RegExp(`^(плотност${L}+)$`) },
  { canon: 'Мощность', variants: new RegExp(`^(мощност${L}+)$`) },
]

// шаблонные строки таблицы goszakup — не характеристики товара (страховка)
const STOP_NAMES = new Set([
  'номер закупки', 'наименование закупки', 'номер лота', 'наименование лота',
  'описание лота', 'дополнительное описание лота', 'количество', 'единица измерения',
  'места поставки', 'место поставки', 'срок поставки', 'характеристики', 'цена',
  'сумма', 'бин', 'заказчик', 'поставщик',
])

/** «Материал изготовления, мм » → «Материал»; неизвестное → приведённое к Title-case. */
export function normalizeCharName(raw: string): string {
  let s = (raw || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[.,;:]+$/g, '')
    .replace(/\((?:в\s+)?(?:мм|см|м|кг|г|л|мл|шт|%)\.?\)/g, ' ') // «(мм)» и т.п.
    .replace(/,\s*(?:мм|см|м|кг|г|л|мл|шт|%)\.?$/g, '') // «, мм» хвостом
    .replace(/\s+/g, ' ')
    .trim()

  if (!s) return ''

  for (const { canon, variants } of CANON) {
    if (variants.test(s)) return canon
  }

  // убрать «шумовые» слова и повторно свериться с картой
  const stripped = s
    .split(' ')
    .filter((w) => !QUALIFIER_WORDS.includes(w))
    .join(' ')
    .trim()
  if (stripped && stripped !== s) {
    for (const { canon, variants } of CANON) {
      if (variants.test(stripped)) return canon
    }
    s = stripped
  }

  return s.charAt(0).toUpperCase() + s.slice(1)
}

// ─────────────────────── агрегация (§5, чистая функция) ───────────────────────

type SpecChar = { name: string; value?: string | null; unit?: string | null }

function cleanExample(v: string): string {
  const t = v.replace(/\s+/g, ' ').trim()
  return t.length > 60 ? t.slice(0, 57) + '…' : t
}

/**
 * Массив ТЗ (каждое — список характеристик) → агрегированный список с частотой.
 * Детерминированно. Одно ТЗ учитывает каноническое имя не более одного раза.
 */
export function aggregateCharacteristics(
  specs: SpecChar[][],
  opts: { mainThreshold?: number; minThreshold?: number } = {},
): AggregatedCharacteristic[] {
  const mainThreshold = opts.mainThreshold ?? 0.5
  const minThreshold = opts.minThreshold ?? 0.2
  const totalSpecs = specs.length
  if (totalSpecs === 0) return []

  const acc = new Map<
    string,
    { count: number; values: string[]; rawNames: Set<string>; units: Map<string, number> }
  >()

  for (const spec of specs) {
    const seenInThisSpec = new Set<string>()
    for (const ch of spec) {
      const rawName = (ch?.name ?? '').trim()
      if (!rawName) continue
      if (STOP_NAMES.has(rawName.toLowerCase())) continue
      const canon = normalizeCharName(rawName)
      if (!canon || STOP_NAMES.has(canon.toLowerCase())) continue

      let e = acc.get(canon)
      if (!e) {
        e = { count: 0, values: [], rawNames: new Set(), units: new Map() }
        acc.set(canon, e)
      }
      e.rawNames.add(rawName)
      const val = (ch?.value ?? '').toString().trim()
      if (val && !e.values.includes(val)) e.values.push(val)
      const unit = (ch?.unit ?? '').toString().trim()
      if (unit) e.units.set(unit, (e.units.get(unit) ?? 0) + 1)

      if (!seenInThisSpec.has(canon)) {
        e.count++
        seenInThisSpec.add(canon)
      }
    }
  }

  const out: AggregatedCharacteristic[] = []
  for (const [name, e] of acc) {
    const confidence = e.count / totalSpecs
    if (confidence < minThreshold) continue
    const unit =
      [...e.units.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? undefined
    out.push({
      name,
      frequency: e.count,
      totalSpecs,
      confidence: Math.round(confidence * 100) / 100,
      level: confidence >= mainThreshold ? 'main' : 'additional',
      examples: e.values.slice(0, 5).map(cleanExample),
      rawNames: [...e.rawNames],
      unit,
    })
  }

  out.sort(
    (a, b) =>
      (a.level === b.level ? 0 : a.level === 'main' ? -1 : 1) ||
      b.frequency - a.frequency ||
      a.name.localeCompare(b.name),
  )
  return out
}

// ─────────────────────── сбор ТЗ (§3–§4, сеть) ───────────────────────

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`timeout ${label}`)), ms)),
  ])
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  const worker = async () => {
    for (;;) {
      const idx = i++
      if (idx >= items.length) return
      out[idx] = await fn(items[idx], idx)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker))
  return out
}

/**
 * Собирает и разбирает до `maxSpecs` реальных ТЗ по коду КТРУ.
 * Не падает, если у части лотов нет файла ТС или PDF не читается.
 */
export async function collectKtruSpecs(
  ktruCode: string,
  opts: BuildOptions = {},
): Promise<{
  lotsFound: number
  specsAvailable: number
  specsExtracted: number
  specs: SpecChar[][]
  notes: string[]
}> {
  const maxLotProbe = opts.maxLotProbe ?? 24
  const maxSpecs = opts.maxSpecs ?? 15
  const perFileTimeoutMs = opts.perFileTimeoutMs ?? 20000
  const concurrency = opts.concurrency ?? 4
  const notes: string[] = []

  const summary = await getKtruProcurement(ktruCode, { activeSampleSize: 60 })
  const lotIds = summary.activeLotSamples.map((l) => l.id).slice(0, Math.max(maxLotProbe, maxSpecs))
  const lotsFound = summary.activeLotSamples.length
  if (lotIds.length === 0) {
    notes.push('живых лотов по этому КТРУ не найдено')
    return { lotsFound, specsAvailable: 0, specsExtracted: 0, specs: [], notes }
  }

  // этап 2: у каких лотов есть файл ТС
  const probed = await mapPool(lotIds.slice(0, maxLotProbe), concurrency, async (lotId) => {
    try {
      const ctx = await withTimeout(getLotContext(lotId), perFileTimeoutMs, `lot ${lotId}`)
      if (!ctx) return null
      const file = pickTechSpecFile(ctx.lotFiles) ?? pickTechSpecFile(ctx.buyFiles)
      return file ? { lotId, url: file.filePath } : null
    } catch {
      return null
    }
  })
  const candidates = probed.filter((x): x is { lotId: number; url: string } => !!x).slice(0, maxSpecs)
  const specsAvailable = candidates.length
  if (specsAvailable === 0) {
    notes.push('ни у одного из проверенных лотов нет файла технической спецификации')
    return { lotsFound, specsAvailable: 0, specsExtracted: 0, specs: [], notes }
  }

  // этап 3: PDF → текст → характеристики (существующий extractSpecification)
  let done = 0
  const extracted = await mapPool(candidates, concurrency, async (c): Promise<SpecChar[] | null> => {
    try {
      const buf = await withTimeout(downloadFile(c.url), perFileTimeoutMs, `dl ${c.lotId}`)
      const { text } = await withTimeout(extractPdfText(buf), perFileTimeoutMs, `pdf ${c.lotId}`)
      const spec = await withTimeout(extractSpecification(text), perFileTimeoutMs * 2, `ai ${c.lotId}`)
      return spec.characteristics.map((r) => ({ name: r.name, value: r.value ?? null, unit: r.unit ?? null }))
    } catch {
      return null
    } finally {
      done++
      opts.onProgress?.(done, candidates.length)
    }
  })

  const specs: SpecChar[][] = []
  for (const x of extracted) if (x && x.length > 0) specs.push(x)
  const specsExtracted = specs.length
  if (specsExtracted < specsAvailable) {
    notes.push(`разобрано ${specsExtracted} из ${specsAvailable} доступных ТЗ`)
  }
  return { lotsFound, specsAvailable, specsExtracted, specs, notes }
}

/** Полный конвейер: код КТРУ → агрегированные характеристики. */
export async function buildKtruCharacteristics(
  ktruCode: string,
  opts: BuildOptions = {},
): Promise<KtruCharacteristicsResult> {
  const collected = await collectKtruSpecs(ktruCode, opts)
  const characteristics = aggregateCharacteristics(collected.specs, {
    mainThreshold: opts.mainThreshold,
    minThreshold: opts.minThreshold,
  })
  const notes = [...collected.notes]
  if (collected.specsExtracted > 0 && characteristics.length === 0) {
    notes.push('в разобранных ТЗ не нашлось повторяющихся характеристик выше порога')
  }
  return {
    ktruCode,
    analyzerVersion: ANALYZER_VERSION,
    lotsFound: collected.lotsFound,
    specsAvailable: collected.specsAvailable,
    specsExtracted: collected.specsExtracted,
    analyzedSpecs: collected.specsExtracted,
    characteristics,
    notes,
    generatedAt: new Date().toISOString(),
  }
}

// Слой «лот → техническая спецификация»: находит прикреплённый файл ТС через
// GraphQL V3 (Lots.Files / TrdBuy.Files), скачивает PDF по публичной ссылке
// (filePath отдаётся без токена — проверено) и делает минимальную нормализацию
// табличной формы документа. Без OCR/AI — только текстовый слой PDF (pdf-parse).
//
// Важно: структура характеристик НЕ придумана — это построчный разбор реальной
// таблицы фиксированного шаблона «Приложение 2 к конкурсной/технической
// документации», который выдаёт сам goszakup. Если у другого лота другой шаблон —
// парсер вернёт rawText целиком и пустой characteristics (см. parseTechSpecTable).

import { gql } from './client.ts'
// pdf-parse/index.js на верхнем уровне читает тестовый файл при !module.parent —
// поэтому берём внутренний модуль напрямую (никакого побочного эффекта).
import pdfParse from 'pdf-parse/lib/pdf-parse.js'

export interface LotFileRef {
  id: number
  filePath: string
  originalName: string | null
  nameRu: string | null
  nameKz: string | null
}

export interface LotContext {
  lotId: number
  lotNumber: string | null
  nameRu: string | null
  descriptionRu: string | null
  amount: number | null
  count: number | null
  refUnitsCode: string | null
  customerBin: string | null
  customerNameRu: string | null
  refLotStatusId: number | null
  pointList: number[]
  buyId: number | null
  buyNumberAnno: string | null
  buyNameRu: string | null
  lotFiles: LotFileRef[]
  buyFiles: LotFileRef[]
}

interface RawLotRow {
  id: number
  lotNumber: string | null
  nameRu: string | null
  descriptionRu: string | null
  amount: number | null
  count: number | null
  customerBin: string | null
  customerNameRu: string | null
  refLotStatusId: number | null
  pointList: number[] | null
  Files: LotFileRef[] | null
  TrdBuy: { id: number; numberAnno: string | null; nameRu: string | null; Files: LotFileRef[] | null } | null
}

/** Возвращает и разобранный контекст, и сырой ответ GraphQL (для сохранения примера как есть). */
export async function getLotContextRaw(
  lotId: number,
): Promise<{ ctx: LotContext | null; raw: unknown }> {
  const r = await gql<{ Lots: RawLotRow[] | null }>(
    `{ Lots(filter:{ id:[${lotId}] }, limit:1){
      id lotNumber nameRu descriptionRu amount count customerBin customerNameRu
      refLotStatusId pointList
      Files{ id filePath originalName nameRu nameKz }
      TrdBuy{ id numberAnno nameRu Files{ id filePath originalName nameRu nameKz } }
    } }`,
  )
  const row = r.data?.Lots?.[0]
  if (!row) return { ctx: null, raw: r }
  return { ctx: mapLotRow(row), raw: r }
}

export async function getLotContext(lotId: number): Promise<LotContext | null> {
  return (await getLotContextRaw(lotId)).ctx
}

function mapLotRow(row: RawLotRow): LotContext {
  return {
    lotId: row.id,
    lotNumber: row.lotNumber ?? null,
    nameRu: row.nameRu ?? null,
    descriptionRu: row.descriptionRu ?? null,
    amount: row.amount ?? null,
    count: row.count ?? null,
    refUnitsCode: null, // на Lots нет; единица измерения — на Plans (см. procurement.ts)
    customerBin: row.customerBin ?? null,
    customerNameRu: row.customerNameRu ?? null,
    refLotStatusId: row.refLotStatusId ?? null,
    pointList: row.pointList ?? [],
    buyId: row.TrdBuy?.id ?? null,
    buyNumberAnno: row.TrdBuy?.numberAnno ?? null,
    buyNameRu: row.TrdBuy?.nameRu ?? null,
    lotFiles: row.Files ?? [],
    buyFiles: row.TrdBuy?.Files ?? [],
  }
}

/** Ищет среди файлов лота/закупки тот, что похож на техническую спецификацию. */
export function pickTechSpecFile(files: LotFileRef[]): LotFileRef | undefined {
  return files.find(
    (f) => /техническ\w*\s+специфик/i.test(f.nameRu ?? '') || /techspec/i.test(f.originalName ?? ''),
  )
}

export async function downloadFile(url: string): Promise<Buffer> {
  const res = await fetch(url) // публичная ссылка, без Authorization — проверено вживую
  if (!res.ok) throw new Error(`Загрузка файла: HTTP ${res.status} (${url})`)
  const ab = await res.arrayBuffer()
  return Buffer.from(ab)
}

export async function extractPdfText(buf: Buffer): Promise<{ text: string; numpages: number }> {
  const r = await pdfParse(buf)
  return { text: r.text, numpages: r.numpages }
}

// Фиксированные подписи строк таблицы «Техническая спецификация закупаемых товаров
// к конкурсной документации» (русский блок документа). В PDF подпись может быть
// перенесена на несколько строк — поэтому матчим по словам через гибкие \s+.
const ROW_LABELS: Array<{ key: string; pattern: RegExp }> = [
  { key: 'Номер закупки', pattern: /Номер\s+закупки\s*:/i },
  { key: 'Наименование закупки', pattern: /Наименование\s+закупки\s*:/i },
  { key: 'Номер лота', pattern: /Номер\s+лота\s*:/i },
  { key: 'Наименование лота', pattern: /Наименование\s+лота\s*:/i },
  { key: 'Описание лота', pattern: /(?<!Дополнительное\s)Описание\s+лота\s*:/i },
  { key: 'Дополнительное описание лота', pattern: /Дополнительное\s+описание\s+лота\s*:/i },
  { key: 'Количество', pattern: /Количество\s*:/i },
  { key: 'Единица измерения', pattern: /Единица\s+измерения\s*:/i },
  { key: 'Места поставки', pattern: /Мест[ао]\s+поставки\s*:/i },
  { key: 'Срок поставки', pattern: /Срок\s+поставки\s*:/i },
  {
    key: 'Характеристики',
    pattern: /Описание\s+и\s+требуемые[\s\S]{0,120}?характеристики\s+закупаемых\s+товаров\s*:/i,
  },
]

export interface TechSpecRow {
  name: string
  value: string
}

/**
 * Построчный разбор русского блока фиксированного шаблона goszakup
 * («Приложение N к конкурсной документации» / «Техническая спецификация…»).
 * Работает по меткам-якорям, а не по позициям — переносы строк внутри значения
 * не мешают. Если ни одна метка не найдена (другой шаблон/язык), возвращает [].
 */
export function parseTechSpecTable(fullText: string): TechSpecRow[] {
  // Берём вторую часть документа (русский вариант), если различима — ищем маркер
  // "Техническая спецификация" после казахского блока; иначе — весь текст.
  const ruStart = fullText.search(/Техническая\s+спецификация/i)
  const text = ruStart >= 0 ? fullText.slice(ruStart) : fullText

  const hits: Array<{ key: string; index: number; end: number }> = []
  for (const { key, pattern } of ROW_LABELS) {
    const m = pattern.exec(text)
    if (m) hits.push({ key, index: m.index, end: m.index + m[0].length })
  }
  if (!hits.length) return []
  hits.sort((a, b) => a.index - b.index)

  const rows: TechSpecRow[] = []
  for (let i = 0; i < hits.length; i++) {
    const start = hits[i].end
    const stop = i + 1 < hits.length ? hits[i + 1].index : text.length
    const value = text.slice(start, stop).replace(/\s+/g, ' ').trim()
    if (value) rows.push({ name: hits[i].key, value })
  }
  return rows
}

export interface TechnicalSpecification {
  lotId: string
  buyId?: string
  title?: string
  rawText?: string
  characteristics?: Array<{ name: string; value: string; unit?: string }>
  source: string
  /** Поля сверх минимальной схемы — реально присутствуют в документе, не выдуманы. */
  format: 'pdf'
  documentTitle?: string
  originalFileName?: string
  numpages?: number
}

export function toTechnicalSpecification(args: {
  lotId: number
  buyId: number | null
  file: LotFileRef
  rawText: string
  numpages: number
  rows: TechSpecRow[]
}): TechnicalSpecification {
  const { lotId, buyId, file, rawText, numpages, rows } = args
  const unitRow = rows.find((r) => r.name === 'Единица измерения')
  const characteristics = rows.map((r) => ({
    name: r.name,
    value: r.value,
    ...(r.name === 'Количество' && unitRow ? { unit: unitRow.value } : {}),
  }))
  const title = rows.find((r) => r.name === 'Наименование лота')?.value

  return {
    lotId: String(lotId),
    buyId: buyId != null ? String(buyId) : undefined,
    title,
    rawText,
    characteristics: characteristics.length ? characteristics : undefined,
    source: file.filePath,
    format: 'pdf',
    documentTitle: file.nameRu ?? undefined,
    originalFileName: file.originalName ?? undefined,
    numpages,
  }
}

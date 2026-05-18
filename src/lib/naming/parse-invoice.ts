import * as XLSX from 'xlsx'
import { normalizeSupplierName } from './supplier-translations'
import type { ParsedInvoice, InvoiceTranslation, InvoiceType } from './types'

// ── Определение типа накладной по имени файла ─────────────────────────────

function detectInvoiceType(fileName: string): InvoiceType {
  const lower = fileName.toLowerCase()
  if (lower.includes('invoice'))  return 'astrafund'
  if (lower.includes('factuur'))  return 'horti_fair'
  return 'unknown'
}

// ── Парсер Astrafund (Invoice*.xls) ──────────────────────────────────────
// Заголовки: строка 19 (index 18), колонка 4 (index 4) = Product description
// Данные: с строки 21 (index 20)

function parseAstrafund(rows: unknown[][]): InvoiceTranslation[] {
  const results: InvoiceTranslation[] = []

  for (let i = 20; i < rows.length; i++) {
    const row = rows[i] as unknown[]
    if (!row || !Array.isArray(row)) continue

    const raw = String(row[4] ?? '').trim()
    if (!raw || raw.length < 2) continue

    // Пропускаем строки с кодом клиента (только цифры/буквы без пробелов)
    if (/^\d+$/.test(raw)) continue
    // Пропускаем итоговые строки
    if (/^(total|итого|subtotal)/i.test(raw)) continue

    const { normalized, confidence, matchedBy, warnings } = normalizeSupplierName(raw)

    results.push({
      original:  raw,
      translated: normalized,
      confidence,
      matchedBy,
      ...(warnings?.length ? { category: warnings.join(',') } : {}),
    })
  }

  return results
}

// ── Парсер Horti Fair (sp Factuur*.xlsx) ─────────────────────────────────
// Заголовки: строка 1 (index 0), колонка "Product description"

function parseHortiFair(rows: unknown[][]): InvoiceTranslation[] {
  if (rows.length < 2) return []

  // Найти индекс колонки "Product description" из заголовочной строки
  const header = (rows[0] as unknown[]).map(c => String(c ?? '').trim().toLowerCase())
  const colIdx = header.findIndex(h =>
    h.includes('product description') || h.includes('description') || h.includes('omschrijving')
  )
  if (colIdx === -1) return []

  const results: InvoiceTranslation[] = []

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as unknown[]
    if (!row || !Array.isArray(row)) continue

    const raw = String(row[colIdx] ?? '').trim()
    if (!raw || raw.length < 2) continue
    if (/^(total|totaal|subtotal)/i.test(raw)) continue

    const { normalized, confidence, matchedBy, warnings } = normalizeSupplierName(raw)

    results.push({
      original:  raw,
      translated: normalized,
      confidence,
      matchedBy,
      ...(warnings?.length ? { category: warnings.join(',') } : {}),
    })
  }

  return results
}

// ── Парсер неизвестного формата — ищет колонку с описанием ───────────────

function parseUnknown(rows: unknown[][]): InvoiceTranslation[] {
  if (rows.length < 2) return []

  // Ищем строку-заголовок по ключевым словам
  let headerIdx = -1
  let colIdx = -1

  for (let i = 0; i < Math.min(25, rows.length); i++) {
    const row = (rows[i] as unknown[]) ?? []
    for (let j = 0; j < row.length; j++) {
      const cell = String(row[j] ?? '').trim().toLowerCase()
      if (cell.includes('description') || cell.includes('product') || cell.includes('omschrijving')) {
        headerIdx = i
        colIdx = j
        break
      }
    }
    if (headerIdx !== -1) break
  }

  if (colIdx === -1) return []

  const results: InvoiceTranslation[] = []
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] as unknown[]
    if (!row) continue
    const raw = String(row[colIdx] ?? '').trim()
    if (!raw || raw.length < 2) continue
    if (/^(total|totaal|subtotal)/i.test(raw)) continue

    const { normalized, confidence, matchedBy } = normalizeSupplierName(raw)
    results.push({ original: raw, translated: normalized, confidence, matchedBy })
  }

  return results
}

// ── Дедупликация (оставляем уникальные original) ─────────────────────────

function deduplicate(items: InvoiceTranslation[]): InvoiceTranslation[] {
  const seen = new Set<string>()
  return items.filter(item => {
    const key = item.original.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// ── Главная функция ───────────────────────────────────────────────────────

export async function parseInvoiceFile(file: File): Promise<ParsedInvoice> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' })

  const type: InvoiceType = detectInvoiceType(file.name)

  let rawTranslations: InvoiceTranslation[]

  if (type === 'astrafund') {
    rawTranslations = parseAstrafund(rows)
  } else if (type === 'horti_fair') {
    rawTranslations = parseHortiFair(rows)
  } else {
    rawTranslations = parseUnknown(rows)
  }

  const translations = deduplicate(rawTranslations)

  return {
    type,
    translations,
    fileName: file.name,
    totalItems: translations.length,
  }
}

// ── Утилита: только высокое confidence (≥ 0.8) ───────────────────────────

export function filterHighConfidence(invoice: ParsedInvoice): ParsedInvoice {
  return {
    ...invoice,
    translations: invoice.translations.filter(t => t.confidence >= 0.8),
    totalItems: invoice.translations.filter(t => t.confidence >= 0.8).length,
  }
}

// ── Утилита: сгруппировать по matchedBy ──────────────────────────────────

export function groupByMatchType(invoice: ParsedInvoice) {
  const groups: Record<string, InvoiceTranslation[]> = {}
  for (const t of invoice.translations) {
    if (!groups[t.matchedBy]) groups[t.matchedBy] = []
    groups[t.matchedBy].push(t)
  }
  return groups
}

// Умный поиск КТРУ v1 — точка входа.
//   text → KtruSearchResult[]
// Детерминированно, без AI. Индекс — data/enstru/enstru_index.json.

import fs from 'node:fs'
import path from 'node:path'
import type { KtruIndexRow, KtruSearchResult, SearchOptions } from './types.ts'
import { normalizeSearchQuery, tokenize } from './normalize.ts'
import { ATTRIBUTE_TERMS } from './synonyms.ts'
import { prepareRow, scoreRow } from './scoring.ts'
import type { PreparedRow } from './scoring.ts'

const DEFAULT_INDEX_PATH = path.join(
  process.cwd(),
  'data',
  'enstru',
  'enstru_index.json',
)

let cachedIndex: KtruIndexRow[] | null = null
let cachedPrepared: PreparedRow[] | null = null
let cachedMaxPlan = 0

/** Загружает индекс из файла (с кэшем). Бросает, если файла нет. */
export function loadIndex(file: string = DEFAULT_INDEX_PATH): KtruIndexRow[] {
  if (cachedIndex && file === DEFAULT_INDEX_PATH) return cachedIndex
  const raw = fs.readFileSync(file, 'utf8')
  const parsed = JSON.parse(raw)
  const rows: KtruIndexRow[] = Array.isArray(parsed) ? parsed : parsed.rows
  if (!Array.isArray(rows)) throw new Error(`enstru index: unexpected shape in ${file}`)
  if (file === DEFAULT_INDEX_PATH) cachedIndex = rows
  return rows
}

function getPrepared(index?: KtruIndexRow[]): {
  prepared: PreparedRow[]
  maxPlan: number
} {
  if (index) {
    const prepared = index.map(prepareRow)
    const maxPlan = index.reduce((m, r) => Math.max(m, r.planCount || 0), 0)
    return { prepared, maxPlan }
  }
  if (!cachedPrepared) {
    const rows = loadIndex()
    cachedPrepared = rows.map(prepareRow)
    cachedMaxPlan = rows.reduce((m, r) => Math.max(m, r.planCount || 0), 0)
  }
  return { prepared: cachedPrepared, maxPlan: cachedMaxPlan }
}

/**
 * Основная функция. Возвращает отсортированный по убыванию score список кандидатов.
 * В выдачу попадают только записи с семантическим совпадением (сигнал A или B > 0).
 */
export function searchKtru(
  query: string,
  options: SearchOptions = {},
): KtruSearchResult[] {
  const limit = options.limit ?? 10
  const minScore = options.minScore ?? 0.05
  const { prepared, maxPlan } = getPrepared(options.index)

  const normalized = normalizeSearchQuery(query)
  const tokens = tokenize(normalized, ATTRIBUTE_TERMS)
  if (!tokens.length) return []

  const scored = prepared.map((pr) => scoreRow(pr, { tokens, maxPlanCount: maxPlan }))

  const results = scored
    .filter((s) => s.signals.name > 0 || s.signals.synonym > 0)
    .filter((s) => s.score >= minScore)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.planCount - a.planCount ||
        a.code.localeCompare(b.code),
    )
    .slice(0, limit)
    .map<KtruSearchResult>((s) => ({
      code: s.code,
      nameRu: s.nameRu,
      score: s.score,
      reasons: dedupe(s.reasons),
      signals: s.signals,
    }))

  return results
}

function dedupe(xs: string[]): string[] {
  return [...new Set(xs)]
}

/** Сброс кэша (для тестов/переиндексации). */
export function _resetCache(): void {
  cachedIndex = null
  cachedPrepared = null
  cachedMaxPlan = 0
}

// Умный поиск КТРУ v1 — точка входа.
//   text → KtruSearchResult[]
// Детерминированно, без AI. Индекс — data/enstru/enstru_index.json.
//
// Конвейер из четырёх явных стадий (см. README задачи):
//   1. candidate retrieval — ШИРОКО: имя ИЛИ синоним ИЛИ официальное описание
//      ИЛИ alias ИЛИ нечёткое имя (опечатка); концепт-КПВЭД как запасной канал.
//   2. candidate ranking   — ТОЧНО: детерминированный scoreRow по сигналам.
//   3. hard guards         — отсечение ложных: нет лексической опоры, декор vs
//      живые цветы, «голова» запроса не совпала, ниже minScore.
//   4. final results       — сортировка, срез до limit, дедуп причин.
// Поиск НЕ требует точного совпадения названия и умеет вернуть НЕСКОЛЬКО
// кандидатов на одно слово («перчатки» → латексные / нитриловые / тканевые …).

import fs from 'node:fs'
import path from 'node:path'
import type { KtruIndexRow, KtruSearchResult, SearchOptions } from './types.ts'
import { normalizeSearchQuery, tokenize } from './normalize.ts'
import { ATTRIBUTE_TERMS } from './synonyms.ts'
import { prepareRow, scoreRow, retrievalSignals } from './scoring.ts'
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
 * Каждый код гарантированно существует в локальном индексе (никаких синтетических
 * кодов). Для общего запроса вернётся несколько кандидатов, у каждого — поле
 * descRu и причины, объясняющие, чем он отличается от соседей.
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

  // ── Stage 1: candidate retrieval (широкий отбор) ──
  const retrieved: { pr: PreparedRow; via: string[] }[] = []
  for (const pr of prepared) {
    const via = retrievalSignals(pr, tokens)
    if (via.length) retrieved.push({ pr, via })
  }
  if (!retrieved.length) return []

  // ── Stage 2: candidate ranking (точный скоринг) ──
  const ranked = retrieved.map(({ pr, via }) => ({
    scored: scoreRow(pr, { tokens, maxPlanCount: maxPlan }),
    via,
    descRu: pr.row.descRu,
  }))

  // ── Stage 3: hard guards (отсечение ложных) ──
  const kept = ranked.filter(({ scored }) => {
    // должна быть ЛЕКСИЧЕСКАЯ опора: чистый концепт-КПВЭД без совпадения слова —
    // это домен, а не ответ на запрос.
    const lexical =
      scored.signals.name > 0 ||
      scored.signals.synonym > 0 ||
      scored.signals.desc > 0 ||
      scored.signals.fuzzy > 0
    if (!lexical) return false
    return scored.score >= minScore
  })

  // ── Stage 4: final results ──
  return kept
    .sort(
      (a, b) =>
        b.scored.score - a.scored.score ||
        b.scored.planCount - a.scored.planCount ||
        a.scored.code.localeCompare(b.scored.code),
    )
    .slice(0, limit)
    .map<KtruSearchResult>(({ scored, via, descRu }) => ({
      code: scored.code,
      nameRu: scored.nameRu,
      descRu,
      score: scored.score,
      retrievedVia: via,
      reasons: dedupe(scored.reasons),
      signals: scored.signals,
    }))
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

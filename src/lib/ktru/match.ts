// Auto KTRU Match для карточки товара.
//   Product (название + характеристики) → TOP КТРУ-кандидаты
//
// Тонкая обёртка над searchKtru (src/lib/ktru/search.ts). БЕЗ AI/Gemini —
// детерминированный лексический поиск по локальному индексу. Задача модуля:
//  1) собрать поисковую строку из названия + характеристик (характеристики —
//     только как материал/тип-хинты, НЕ обязательные слова);
//  2) прогнать через существующий searchKtru;
//  3) разложить по «уверенности» и дать человекочитаемое объяснение.

import { searchKtru } from './search.ts'
import { normalizeSearchQuery, lemma } from './normalize.ts'
import { ATTRIBUTE_TERMS } from './synonyms.ts'

/** Минимальная форма характеристики товара (совместима с smart-ktru ProductCharacteristic). */
export interface MatchCharacteristic {
  name?: string
  value?: string
  unit?: string
}

export type KtruMatchConfidence = 'high' | 'medium'

export interface KtruMatchResult {
  code: string
  /** наименование КТРУ (как в индексе) */
  name: string
  /** сырой score движка, 0..1 */
  score: number
  confidence: KtruMatchConfidence
  /** одно понятное предложение — почему предложен этот код */
  reason: string
}

export interface KtruMatchResponse {
  /** строка, реально ушедшая в поисковый движок (для отладки/прозрачности) */
  query: string
  results: KtruMatchResult[]
  /** true, если движок нашёл хотя бы один кандидат «возможного» уровня и выше */
  confident: boolean
}

// Пороги подобраны под фактическое распределение score в индексе v1
// (см. tests/ktru-match.test.mjs). Точные многословные совпадения по типу товара
// в этом индексе дают ~0.58–0.70, поэтому «высокое» начинается ниже 0.80.
const HIGH = 0.62
const MEDIUM = 0.45
const LIMIT = 10

const CONF_LABEL: Record<KtruMatchConfidence, string> = {
  high: 'высокое совпадение',
  medium: 'возможное совпадение',
}

export function ktruMatchConfidenceLabel(c: KtruMatchConfidence): string {
  return CONF_LABEL[c]
}

/**
 * Поисковая строка = название товара + материал/тип-слова из характеристик.
 * Из характеристик берём ТОЛЬКО термины-характеристики (пластик/керамика/срезанный/…),
 * т.е. те, чья лемма ∈ ATTRIBUTE_TERMS. Размеры, цвета, числа и названия полей
 * («Диаметр», «Цвет») намеренно отбрасываем — они лишь разбавляют запрос.
 */
export function buildMatchQuery(
  name: string,
  characteristics: MatchCharacteristic[] = [],
): string {
  const extra: string[] = []
  for (const c of characteristics) {
    for (const part of [c?.value, c?.name]) {
      if (!part) continue
      for (const w of normalizeSearchQuery(String(part)).split(' ')) {
        if (w && ATTRIBUTE_TERMS.has(lemma(w))) extra.push(w)
      }
    }
  }
  return [String(name || '').trim(), ...new Set(extra)].filter(Boolean).join(' ')
}

/** Собирает одно предложение-объяснение из «сырых» reasons движка. */
function buildReason(nameRu: string, reasons: string[], hasConflict: boolean): string {
  const hasName = reasons.some((r) => r.startsWith('совпадение по названию'))
  const hasSyn = reasons.some((r) => r.includes('синоним'))
  const hasAttr = reasons.some((r) => r.startsWith('совпадение характеристики'))
  const hasKpved = reasons.some((r) => r.startsWith('класс КПВЭД'))

  let base: string
  if (hasName && hasAttr) {
    base = `Название и характеристики товара соответствуют наименованию КТРУ «${nameRu}»`
  } else if (hasName) {
    base = `Название товара соответствует наименованию КТРУ «${nameRu}»`
  } else if (hasSyn) {
    base = `Товар относится к той же товарной группе, что и КТРУ «${nameRu}»`
  } else if (hasKpved) {
    base = `Товар относится к тому же классу КПВЭД, что и КТРУ «${nameRu}»`
  } else {
    base = reasons[0] ?? `Возможное соответствие КТРУ «${nameRu}»`
  }
  return hasConflict
    ? `${base}. Внимание: возможен конфликт характеристик — проверьте материал/тип`
    : base
}

/**
 * Главная функция. Название + характеристики → отфильтрованный TOP КТРУ.
 * Детерминированно. Пустой/мусорный запрос → { results: [], confident: false }.
 */
export function matchKtru(
  name: string,
  characteristics: MatchCharacteristic[] = [],
): KtruMatchResponse {
  const query = buildMatchQuery(name, characteristics)
  if (!query.trim()) return { query, results: [], confident: false }

  // берём с запасом и низким порогом, дальше режем сами по «уверенности»
  const raw = searchKtru(query, { limit: 25, minScore: 0.2 })

  const results: KtruMatchResult[] = raw
    .filter((r) => r.score >= MEDIUM)
    .slice(0, LIMIT)
    .map((r) => ({
      code: r.code,
      name: r.nameRu,
      score: r.score,
      confidence: r.score >= HIGH ? 'high' : 'medium',
      reason: buildReason(r.nameRu, r.reasons, (r.signals?.negative ?? 0) > 0),
    }))

  return { query, results, confident: results.length > 0 }
}

// Нормализация и токенизация поискового запроса КТРУ.
// Одна и та же лемматизация применяется к запросу и к наименованиям индекса —
// важна согласованность, а не лингвистическая точность.

import { LEMMA_MAP, STOPWORDS } from './synonyms.ts'

/**
 * Приводит строку к каноничному виду: lower-case, ё→е, пунктуация → пробел,
 * схлопнутые пробелы, trim.
 */
export function normalizeSearchQuery(query: string): string {
  return (query || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Консервативные суффиксы для «лемма-lite». Срезаем только если остаётся ≥4 символов
// и только по одному разу. Порядок — от длинных к коротким.
const SUFFIXES = [
  'ами', 'ями', 'ов', 'ев', 'ах', 'ях', 'ый', 'ий', 'ая', 'яя', 'ое', 'ее',
  'ые', 'ие', 'ом', 'ем', 'ой', 'ей', 'у', 'ю', 'а', 'я', 'и', 'ы', 'е', 'о',
]

/** Грубая лемматизация одного токена: явная карта → затем срез одного суффикса. */
export function lemma(token: string): string {
  const t = token.toLowerCase()
  if (LEMMA_MAP[t]) return LEMMA_MAP[t]
  if (t.length <= 4) return t
  for (const s of SUFFIXES) {
    if (t.length - s.length >= 4 && t.endsWith(s)) {
      const base = t.slice(0, -s.length)
      return LEMMA_MAP[base] ?? base
    }
  }
  return t
}

export interface QueryToken {
  /** токен как в запросе (после нормализации) */
  raw: string
  /** лемматизированная форма */
  lemma: string
  /** является ли токен характеристикой (материал/состояние/тип) */
  isAttr: boolean
}

/**
 * Разбивает нормализованную строку на значимые токены: убирает стоп-слова и
 * односимвольные (кроме цифр), лемматизирует, помечает характеристики.
 */
export function tokenize(
  normalized: string,
  attrTerms: Set<string> = new Set(),
): QueryToken[] {
  const out: QueryToken[] = []
  const seen = new Set<string>()
  for (const w of normalized.split(' ')) {
    if (!w) continue
    if (STOPWORDS.has(w)) continue
    if (w.length < 2 && !/\d/.test(w)) continue
    const lem = lemma(w)
    const key = `${w}|${lem}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ raw: w, lemma: lem, isAttr: attrTerms.has(lem) })
  }
  return out
}

/** Утилита: множество лемм из произвольного текста (для наименований индекса). */
export function lemmaSet(text: string): Set<string> {
  const norm = normalizeSearchQuery(text)
  const s = new Set<string>()
  for (const w of norm.split(' ')) {
    if (!w || STOPWORDS.has(w)) continue
    if (w.length < 2 && !/\d/.test(w)) continue
    s.add(lemma(w))
  }
  return s
}

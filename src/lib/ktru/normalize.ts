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

// Казахские окончания множественности / принадлежности / падежа. Одна итерация,
// от длинных к коротким, только если остаётся ≥4 символа. Нужно, чтобы запрос
// «қолғап» сходился с наименованием справочника «Қолғаптар».
const KZ_SUFFIXES = [
  'дардың', 'дердің', 'тардың', 'тердің', 'лардың', 'лердің',
  'дар', 'дер', 'тар', 'тер', 'лар', 'лер',
  'ның', 'нің', 'дың', 'дің', 'тың', 'тің',
  'ды', 'ді', 'ты', 'ті', 'ны', 'ні', 'ға', 'ге', 'қа', 'ке',
  'да', 'де', 'та', 'те', 'нан', 'нен', 'дан', 'ден', 'тан', 'тен',
  'ы', 'і',
]
const CYR_KZ = /[әіңғүұқөһ]/

/** Грубая лемматизация одного токена: явная карта → срез RU-суффикса → срез KZ-суффикса. */
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
  // казахская морфология. Полный набор окончаний — только для токенов с
  // казах-специфичной буквой (қолғаптар, дәрі-дәрмек), иначе рискуем срезать
  // русское слово. Для слов без спец-букв допускаем лишь явные показатели
  // множественности после согласной (маскалар, халаттар) и с запасом по длине.
  if (CYR_KZ.test(t)) {
    for (const s of KZ_SUFFIXES) {
      if (t.length - s.length >= 4 && t.endsWith(s)) {
        const base = t.slice(0, -s.length)
        return LEMMA_MAP[base] ?? base
      }
    }
  } else {
    for (const s of ['тар', 'тер', 'лар', 'лер', 'дар', 'дер']) {
      if (t.length - s.length >= 5 && t.endsWith(s)) {
        const base = t.slice(0, -s.length)
        return LEMMA_MAP[base] ?? base
      }
    }
  }
  return t
}

/** Расстояние Левенштейна (для fuzzy-совпадения имён при опечатках). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  const prev = new Array(b.length + 1)
  for (let j = 0; j <= b.length; j++) prev[j] = j
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]
    prev[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]
      prev[j] = Math.min(
        prev[j] + 1,
        prev[j - 1] + 1,
        diag + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
      diag = tmp
    }
  }
  return prev[b.length]
}

/**
 * Расстояние Дамерау—Левенштейна (с учётом перестановки соседних букв как одной
 * операции). Перестановка — самая частая опечатка («перчтаки» → «перчатки»).
 */
export function damerauLevenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  const m = a.length, n = b.length
  const d: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) d[i][0] = i
  for (let j = 0; j <= n; j++) d[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
      if (
        i > 1 && j > 1 &&
        a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]
      ) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
      }
    }
  }
  return d[m][n]
}

/** Похожи ли два токена с точностью до опечатки (порог зависит от длины). */
export function fuzzyEq(a: string, b: string): boolean {
  const la = a.length, lb = b.length
  if (Math.abs(la - lb) > 2) return false
  const max = Math.min(la, lb) >= 8 ? 2 : Math.min(la, lb) >= 5 ? 1 : 0
  if (max === 0) return a === b
  return damerauLevenshtein(a, b) <= max
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

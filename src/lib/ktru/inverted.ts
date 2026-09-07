// In-memory инвертированный индекс: лемма → строки, где она встречается
// (в наименовании ru/kz, официальном описании или alias'ах).
//
// Назначение — ЭТАП 0 конвейера поиска: вместо линейного прохода по всем ~45k
// строкам берём объединение постингов по леммам запроса (и их синонимам), т.е.
// обычно несколько десятков–сотен кандидатов. Дальше работает прежний
// retrievalSignals → scoreRow → hard guards без изменений.
//
// Токенизация НЕ дублируется: леммы берём из уже построенного PreparedRow
// (nameLemmas ∪ descLemmas ∪ aliasLemmas). Кэшируется рядом с cachedPrepared.

import type { PreparedRow } from './scoring.ts'
import { synonymsOf } from './scoring.ts'
import { damerauLevenshtein } from './normalize.ts'
import type { QueryToken } from './normalize.ts'

export interface InvertedIndex {
  /** лемма → индексы строк в массиве prepared */
  postings: Map<string, number[]>
  /** все различные леммы (ключи), сгруппированные по длине — для fuzzy-фолбэка */
  keysByLen: Map<number, string[]>
  rows: number
}

export function buildInverted(prepared: PreparedRow[]): InvertedIndex {
  const acc = new Map<string, Set<number>>()
  const add = (lemma: string, i: number) => {
    if (!lemma) return
    let s = acc.get(lemma)
    if (!s) {
      s = new Set<number>()
      acc.set(lemma, s)
    }
    s.add(i)
  }
  // Относительные прилагательные лемматизуются в «Xн» (кабельн, автомобильн,
  // мебельн, канцелярск→нет), а базовое существительное остаётся «X»/«Xь».
  // Чтобы запрос-существительное («кабель») находил строки-прилагательные
  // («кабельный ввод»), под «Xн»-леммой дополнительно кладём постинг «X».
  // Ранее этот мост давал линейный per-row fuzzy; тут он бесплатный (build-time).
  const addAdjBridge = (lemma: string, i: number) => {
    if (lemma.length >= 5 && lemma.endsWith('н')) add(lemma.slice(0, -1), i)
  }
  prepared.forEach((pr, i) => {
    for (const l of pr.nameLemmas) {
      add(l, i)
      addAdjBridge(l, i)
    }
    for (const l of pr.descLemmas) add(l, i)
    for (const l of pr.aliasLemmas) add(l, i)
  })
  const postings = new Map<string, number[]>()
  const keysByLen = new Map<number, string[]>()
  for (const [lemma, set] of acc) {
    postings.set(lemma, [...set])
    const bucket = keysByLen.get(lemma.length)
    if (bucket) bucket.push(lemma)
    else keysByLen.set(lemma.length, [lemma])
  }
  return { postings, keysByLen, rows: prepared.length }
}

const FUZZY_MIN_LEN = 6

/**
 * Возвращает индексы строк-кандидатов для запроса. Широкий union:
 *   лемма токена + все её синонимы → постинги.
 * Если какой-то content-токен не дал ни одного точного совпадения и он длинный —
 * добираем кандидатов нечётким совпадением по КЛЮЧАМ индекса (не по строкам):
 * это дёшево (число различных лемм ≪ числа строк) и сохраняет recall на опечатках.
 */
export function selectCandidates(
  inv: InvertedIndex,
  tokens: QueryToken[],
): number[] {
  const content = tokens.filter((t) => !t.isAttr)
  if (!content.length) return []
  const out = new Set<number>()

  const pull = (lemma: string): boolean => {
    const p = inv.postings.get(lemma)
    if (!p) return false
    for (const i of p) out.add(i)
    return p.length > 0
  }

  for (const t of content) {
    let matched = pull(t.lemma)
    const syns = synonymsOf(t.lemma)
    if (syns) for (const s of syns) matched = pull(s) || matched

    if (!matched && t.lemma.length >= FUZZY_MIN_LEN) {
      const budget = t.lemma.length >= 9 ? 2 : 1
      // мультимножество символов запроса — для дешёвой нижней оценки правки
      // (editDistance ≥ maxLen − |общие символы|): отсекаем damerau для явных «не тех».
      const qCount = new Map<string, number>()
      for (const ch of t.lemma) qCount.set(ch, (qCount.get(ch) ?? 0) + 1)
      for (let len = t.lemma.length - budget; len <= t.lemma.length + budget; len++) {
        const bucket = inv.keysByLen.get(len)
        if (!bucket) continue
        for (const key of bucket) {
          if (key.length < FUZZY_MIN_LEN) continue
          let common = 0
          const seen = new Map<string, number>()
          for (const ch of key) {
            const used = seen.get(ch) ?? 0
            if (used < (qCount.get(ch) ?? 0)) {
              common++
              seen.set(ch, used + 1)
            }
          }
          if (Math.max(t.lemma.length, key.length) - common > budget) continue
          if (damerauLevenshtein(t.lemma, key) <= budget) pull(key)
        }
      }
    }
  }
  return [...out]
}

// Клиентский матчер поиска — ФОЛБЭК, когда серверный /api/search недоступен
// (например, RPC search_products ещё не применён в БД). Терпим к транслиту
// (ru↔en) и регистру. Серверный путь — основной, этот включается только при ошибке.

import { normalizeQuery, translitRuToEn, translitEnToRu } from './search-synonyms'

/** Совпадает ли запрос с «сеном» (любая строка: name + display_name). */
export function clientSearchMatch(haystack: string, query: string): boolean {
  const q = normalizeQuery(query)
  if (!q) return true
  const hay = normalizeQuery(haystack)
  if (hay.includes(q)) return true
  const qTranslit = translitRuToEn(q)
  if (qTranslit !== q && hay.includes(qTranslit)) return true
  const qRu = translitEnToRu(q)
  if (qRu !== q && hay.includes(qRu)) return true
  return false
}

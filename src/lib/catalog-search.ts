// Клиентский матчер поиска — ФОЛБЭК, когда серверный /api/search недоступен
// (например, RPC search_products ещё не применён в БД). Терпим к транслиту
// (ru↔en) и регистру. Серверный путь — основной, этот включается только при ошибке.

import { normalizeQuery } from './search-synonyms'

const RU_TO_EN: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'zh', з: 'z', и: 'i', й: 'j',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
}
const EN_TO_RU: Record<string, string> = {
  a: 'а', b: 'б', v: 'в', g: 'г', d: 'д', e: 'е', z: 'з', i: 'и', j: 'й', k: 'к', l: 'л',
  m: 'м', n: 'н', o: 'о', p: 'п', r: 'р', s: 'с', t: 'т', u: 'у', f: 'ф', h: 'х', y: 'й', c: 'к',
}

function translitRuToEn(s: string): string {
  return s.split('').map((c) => RU_TO_EN[c] ?? c).join('')
}
function translitEnToRu(s: string): string {
  return s.split('').map((c) => EN_TO_RU[c] ?? c).join('')
}

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

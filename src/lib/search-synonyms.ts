// Единый словарь синонимов поиска на проект. Используется И ИИ-ботом поддержки
// (в промпте классификатора расходки), И серверным поиском каталога (/api/search)
// для расширения запроса. Один источник правды — правится здесь.
//
// Модель: «как говорит клиент → как называется в каталоге».

export interface SynonymEntry {
  /** Разговорные формы / профессиональный сленг / частые опечатки клиента. */
  spoken: string[]
  /** Каноничный термин, которым товар назван в каталоге. */
  canonical: string
}

// Стартовый набор. Расширяется по логам реальных запросов.
export const SEARCH_SYNONYMS: SynonymEntry[] = [
  { spoken: ['оазис', 'пиафлор'], canonical: 'губка флористическая' },
  { spoken: ['самоклейка'], canonical: 'плёнка' },
  { spoken: ['скотч'], canonical: 'лента клейкая' },
  { spoken: ['целлофан'], canonical: 'плёнка' },
  { spoken: ['бант'], canonical: 'лента' },
  { spoken: ['земля'], canonical: 'грунт' },
  { spoken: ['горшочек', 'вазон'], canonical: 'горшок' },
  { spoken: ['отрава', 'химия от вредителей'], canonical: 'защита растений' },
  { spoken: ['упаковочная бумага', 'обёрточная'], canonical: 'бумага' },
  { spoken: ['коробочка'], canonical: 'коробка' },
  // Бренды с устойчивыми опечатками, которые транслит + триграммы не добивают
  // (подмена первой гласной o→a рушит похожесть). Прямой маппинг на латинское имя.
  { spoken: ['осмокот', 'осмокоте', 'асмокот', 'асмокоте'], canonical: 'osmocote' },
]

/** Нормализация запроса: trim, нижний регистр, ё→е. */
export function normalizeQuery(q: string): string {
  return q.trim().toLowerCase().replace(/ё/g, 'е')
}

// ── транслитерация (кириллица ↔ латиница) ────────────────────────────────────
// Похожесть (триграммы) считается посимвольно — кириллица и латиница не
// пересекаются. Транслит приводит запрос к одному алфавиту с названием, а
// «остаток» расхождения добивает word_similarity. Латинские бренды удобрений/химии,
// набранные кириллицей («осмокот» → OSMOCOTE), иначе не находятся вовсе.
const RU_TO_EN: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'zh', з: 'z', и: 'i', й: 'j',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
}
const EN_TO_RU: Record<string, string> = {
  a: 'а', b: 'б', v: 'в', g: 'г', d: 'д', e: 'е', z: 'з', i: 'и', j: 'й', k: 'к', l: 'л',
  m: 'м', n: 'н', o: 'о', p: 'п', r: 'р', s: 'с', t: 'т', u: 'у', f: 'ф', h: 'х', y: 'й', c: 'к',
}

export function translitRuToEn(s: string): string {
  return s.split('').map((c) => RU_TO_EN[c] ?? c).join('')
}
export function translitEnToRu(s: string): string {
  return s.split('').map((c) => EN_TO_RU[c] ?? c).join('')
}

/**
 * Расширяет запрос синонимами и транслитом для серверного поиска.
 * Возвращает [нормализованный запрос, ...каноничные термины, ...транслит-варианты]
 * без дублей. Транслит ДОБАВЛЯЕТСЯ доп. термами (не заменяет исходный) — обычный
 * кириллический запрос продолжает искаться как есть.
 */
export function expandSearchQuery(q: string): string[] {
  const n = normalizeQuery(q)
  if (!n) return []
  const out = new Set<string>([n])
  for (const { spoken, canonical } of SEARCH_SYNONYMS) {
    if (spoken.some((s) => n.includes(normalizeQuery(s)))) {
      out.add(normalizeQuery(canonical))
    }
  }
  // Транслит в обе стороны: вариант в другом алфавите — отдельный терм.
  const ru2en = translitRuToEn(n)
  if (ru2en !== n) out.add(ru2en)
  const en2ru = translitEnToRu(n)
  if (en2ru !== n) out.add(en2ru)
  return [...out]
}

/** Блок словаря для промпта классификатора ИИ-бота (формат «клиент → каталог»). */
export function formatSynonymsForPrompt(): string {
  return SEARCH_SYNONYMS.map(({ spoken, canonical }) => `${spoken.join(', ')} → ${canonical}`).join('\n')
}

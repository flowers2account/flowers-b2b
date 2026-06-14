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
]

/** Нормализация запроса: trim, нижний регистр, ё→е. */
export function normalizeQuery(q: string): string {
  return q.trim().toLowerCase().replace(/ё/g, 'е')
}

/**
 * Расширяет запрос синонимами для серверного поиска.
 * Возвращает [нормализованный запрос, ...каноничные термины каталога] без дублей.
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
  return [...out]
}

/** Блок словаря для промпта классификатора ИИ-бота (формат «клиент → каталог»). */
export function formatSynonymsForPrompt(): string {
  return SEARCH_SYNONYMS.map(({ spoken, canonical }) => `${spoken.join(', ')} → ${canonical}`).join('\n')
}

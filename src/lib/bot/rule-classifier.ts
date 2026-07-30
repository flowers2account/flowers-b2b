export type RuleIntent = 'smalltalk' | 'accessories' | 'site_help' | 'other'

export interface RuleClassifyResult {
  intent: RuleIntent
  keywords: string[]
}

const ACCESSORY_RULES: Array<{ keyword: string; pattern: RegExp }> = [
  { keyword: 'атласная лента', pattern: /(?<![\p{L}\p{N}])атлас\p{L}*\s+лент\p{L}*|(?<![\p{L}\p{N}])лент\p{L}*\s+атлас\p{L}*/u },
  { keyword: 'репсовая лента', pattern: /(?<![\p{L}\p{N}])репс\p{L}*\s+лент\p{L}*|(?<![\p{L}\p{N}])лент\p{L}*\s+репс\p{L}*/u },
  { keyword: 'лента', pattern: /(?<![\p{L}\p{N}])лент\p{L}*/u },
  { keyword: 'органза', pattern: /(?<![\p{L}\p{N}])органз\p{L}*/u },
  { keyword: 'пленка', pattern: /(?<![\p{L}\p{N}])пленк\p{L}*/u },
  { keyword: 'упаковка', pattern: /(?<![\p{L}\p{N}])упаков\p{L}*/u },
  { keyword: 'тишью', pattern: /(?<![\p{L}\p{N}])тишью(?![\p{L}\p{N}])/u },
  { keyword: 'фоамиран', pattern: /(?<![\p{L}\p{N}])фоамиран\p{L}*/u },
  { keyword: 'кашпо', pattern: /(?<![\p{L}\p{N}])кашпо(?![\p{L}\p{N}])/u },
  { keyword: 'горшок', pattern: /(?<![\p{L}\p{N}])горш\p{L}*/u },
  { keyword: 'грунт', pattern: /(?<![\p{L}\p{N}])грунт\p{L}*/u },
  { keyword: 'удобрение', pattern: /(?<![\p{L}\p{N}])удобрен\p{L}*/u },
  { keyword: 'корзина', pattern: /(?<![\p{L}\p{N}])корзин\p{L}*/u },
  { keyword: 'коробка', pattern: /(?<![\p{L}\p{N}])коробк\p{L}*/u },
  { keyword: 'бечевка', pattern: /(?<![\p{L}\p{N}])бечевк\p{L}*/u },
  { keyword: 'шпагат', pattern: /(?<![\p{L}\p{N}])шпагат\p{L}*/u },
  { keyword: 'бумага', pattern: /(?<![\p{L}\p{N}])бумаг\p{L}*/u },
  { keyword: 'сетка', pattern: /(?<![\p{L}\p{N}])сетк\p{L}*/u },
  { keyword: 'расходка', pattern: /(?<![\p{L}\p{N}])расходк\p{L}*/u },
  { keyword: 'флористическая расходка', pattern: /(?<![\p{L}\p{N}])флорист\p{L}*\s+расходк\p{L}*/u },
  { keyword: 'флористические материалы', pattern: /(?<![\p{L}\p{N}])флорист\p{L}*\s+материал\p{L}*/u },
]

export const ACCESSORY_RULE_KEYWORDS = ACCESSORY_RULES.map((rule) => rule.keyword)

export function classifyByRules(message: string): RuleClassifyResult | null {
  const normalized = normalizeForRules(message)
  if (!normalized) return null

  const keywords: string[] = []
  for (const rule of ACCESSORY_RULES) {
    if (rule.pattern.test(normalized) && !keywords.includes(rule.keyword)) {
      keywords.push(rule.keyword)
    }
  }

  if (keywords.length === 0) return null
  return { intent: 'accessories', keywords: keywords.slice(0, 5) }
}

export function hasAccessoryRuleKeyword(message: string): boolean {
  return Boolean(classifyByRules(message))
}

function normalizeForRules(message: string): string {
  return message
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}\s-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

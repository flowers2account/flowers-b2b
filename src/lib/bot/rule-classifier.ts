export type RuleIntent = 'smalltalk' | 'accessories' | 'pot' | 'site_help' | 'other'

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
  // (?!ечн) отсекает «горшечные/горшечный» (прилагательное про ЖИВОЕ растение — intent
  // 'pot', см. PLANT_RULES) от «горшок/горшки/горшочек» (тара, расходка).
  // (?<!в ) отсекает локативную конструкцию «В горшке/горшках/горшочке» («растение В
  // горшке» — тоже intent 'pot', см. PLANT_RULES ниже) от «нужен горшок» / «горшки для
  // растений» (сам горшок как товар — остаётся accessories).
  { keyword: 'горшок', pattern: /(?<![\p{L}\p{N}])(?<!в )горш(?!ечн)\p{L}*/u },
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

// Живые горшечные/комнатные растения (intent 'pot') — НЕ тара (горшок/кашпо/ваза —
// это ACCESSORY_RULES). Только виды, которых нет в SUBCAT_CUT (src/lib/product-subcats.ts)
// под тем же разговорным словом — «роза», «орхидея», «антуриум», «гортензия»,
// «хризантема» намеренно исключены: они продаются и на срез, и в горшке, слово
// само по себе не определяет intent — такие случаи оставляем Gemini (полный контекст
// фразы). Не связано с CATEGORY_TREE (это таксономия только accessories).
const PLANT_RULES: Array<{ keyword: string; pattern: RegExp }> = [
  { keyword: 'горшечные растения', pattern: /(?<![\p{L}\p{N}])горшечн\p{L}*/u },
  { keyword: 'комнатные растения', pattern: /(?<![\p{L}\p{N}])комнатн\p{L}*\s+растен\p{L}*/u },
  { keyword: 'спатифиллум', pattern: /(?<![\p{L}\p{N}])спатифиллум\p{L}*/u },
  { keyword: 'монстера', pattern: /(?<![\p{L}\p{N}])монстер\p{L}*/u },
  { keyword: 'драцена', pattern: /(?<![\p{L}\p{N}])драцен\p{L}*/u },
  { keyword: 'фикус', pattern: /(?<![\p{L}\p{N}])фикус\p{L}*/u },
  { keyword: 'замиокулькас', pattern: /(?<![\p{L}\p{N}])замиокулькас\p{L}*/u },
  { keyword: 'кактус', pattern: /(?<![\p{L}\p{N}])кактус\p{L}*/u },
  { keyword: 'суккулент', pattern: /(?<![\p{L}\p{N}])суккулент\p{L}*/u },
  { keyword: 'пальма', pattern: /(?<![\p{L}\p{N}])пальм\p{L}*/u },
  { keyword: 'каланхоэ', pattern: /(?<![\p{L}\p{N}])каланхоэ\p{L}*/u },
  { keyword: 'бегония', pattern: /(?<![\p{L}\p{N}])бегони\p{L}*/u },
  { keyword: 'цикламен', pattern: /(?<![\p{L}\p{N}])цикламен\p{L}*/u },
  { keyword: 'юкка', pattern: /(?<![\p{L}\p{N}])юкк\p{L}*/u },
  { keyword: 'папоротник', pattern: /(?<![\p{L}\p{N}])папоротник\p{L}*/u },
  { keyword: 'калатея', pattern: /(?<![\p{L}\p{N}])калате\p{L}*/u },
  { keyword: 'бромелия', pattern: /(?<![\p{L}\p{N}])бромели\p{L}*/u },
  { keyword: 'пуансеттия', pattern: /(?<![\p{L}\p{N}])пуансетти\p{L}*/u },
  // «растение/цветок … В горшке/горшках» (оба слова, любой порядок) — клиент говорит о
  // ЖИВОМ растении в таре, а не покупает тару саму по себе («горшок для растения» —
  // остаётся accessories, см. (?<!в ) в ACCESSORY_RULES выше и не пересекается с этим
  // правилом, т.к. там нет предлога «в» перед «горш»). Без конкретного вида → общий
  // маркер (уходит в listPotPlants, см. GENERIC_POT_KEYWORDS в accessories-bot.ts).
  {
    keyword: 'горшечные растения',
    pattern: /(?=[\s\S]*(?<![\p{L}\p{N}])(?:раст|цвет)\p{L}*)(?=[\s\S]*(?<![\p{L}\p{N}])в\s+горш\p{L}*)/u,
  },
]

export function classifyByRules(message: string): RuleClassifyResult | null {
  const normalized = normalizeForRules(message)
  if (!normalized) return null

  const accessoryKeywords: string[] = []
  for (const rule of ACCESSORY_RULES) {
    if (rule.pattern.test(normalized) && !accessoryKeywords.includes(rule.keyword)) {
      accessoryKeywords.push(rule.keyword)
    }
  }
  if (accessoryKeywords.length > 0) {
    return { intent: 'accessories', keywords: accessoryKeywords.slice(0, 5) }
  }

  const plantKeywords: string[] = []
  for (const rule of PLANT_RULES) {
    if (rule.pattern.test(normalized) && !plantKeywords.includes(rule.keyword)) {
      plantKeywords.push(rule.keyword)
    }
  }
  if (plantKeywords.length > 0) {
    return { intent: 'pot', keywords: plantKeywords.slice(0, 5) }
  }

  return null
}

export function hasAccessoryRuleKeyword(message: string): boolean {
  return classifyByRules(message)?.intent === 'accessories'
}

export function hasPotRuleKeyword(message: string): boolean {
  return classifyByRules(message)?.intent === 'pot'
}

function normalizeForRules(message: string): string {
  return message
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}\s-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

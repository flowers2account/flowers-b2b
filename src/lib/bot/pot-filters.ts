// Извлечение/применение числовых ограничений клиента для intent='pot' — ДЕТЕРМИНИРОВАННО
// (regex, без LLM). Причина: если извлечение живёт внутри Gemini-классификации, оно не
// сработает для сообщений, пойманных classifyByRules() раньше Gemini (именованные виды —
// «монстера 14 см» и т.п., это основной путь, не edge case) — вызывающая сторона должна
// звать extractPotFilters() на сырое сообщение БЕЗ ОГЛЯДКИ на то, как определился intent.
// Отфильтровано кодом здесь = Gemini в composeAnswer получает уже проверенные товары и
// может честно говорить о соответствии (см. SYSTEM_PROMPT, блок «ПРИМЕНЁННЫЕ ФИЛЬТРЫ»).

export interface PotFilters {
  maxPrice?: number
  minQty?: number
  potDiameter?: number
}

interface FilterableRow {
  price: number | null
  qty: number | null
  pot_diameter: number | null
}

/** Ровно 3 параметра первого этапа: цена, количество, диаметр горшка (высота — не сейчас). */
export function extractPotFilters(message: string): PotFilters {
  const norm = message.toLowerCase().replace(/ё/g, 'е')
  const filters: PotFilters = {}

  // Диаметр: «12 см», «12см», «диаметр 12» — извлекаем ПЕРВЫМ, чтобы это же число не
  // утекло в minQty ниже (у него отдельный, непересекающийся суффиксный паттерн).
  // (?![\p{L}]) вместо \b: \b в JS не видит кириллицу как «словесный» символ (только
  // ASCII \w), поэтому «см?» на конце фразы \b НЕ ловит — тот же случай, что и в
  // rule-classifier.ts.
  const diameterMatch =
    norm.match(/(\d{1,3})\s*см(?![\p{L}])/u) ?? norm.match(/диаметр\p{L}*\s*(\d{1,3})(?![\p{L}\p{N}])/u)
  if (diameterMatch) {
    const d = Number(diameterMatch[1])
    if (Number.isFinite(d) && d > 0 && d < 200) filters.potDiameter = d
  }

  // Цена: «до 5000», «до 5000 ₸/тенге», «не дороже 5000».
  const priceMatch = norm.match(/(?:до|не\s*дороже)\s*(\d{3,7})/)
  if (priceMatch) {
    const p = Number(priceMatch[1])
    if (Number.isFinite(p) && p > 0) filters.maxPrice = p
  }

  // Количество: «10 штук/шт/одинаковых» — суффикс обязателен (не любое число в тексте,
  // иначе «12 см» или «до 5000» ложно утекут сюда).
  const qtyMatch = norm.match(/(\d{1,4})\s*(?:шт\.?|штук|одинаков\w*)/)
  if (qtyMatch) {
    const q = Number(qtyMatch[1])
    if (Number.isFinite(q) && q > 0) filters.minQty = q
  }

  return filters
}

export function hasActiveFilters(filters: PotFilters): boolean {
  return filters.maxPrice != null || filters.minQty != null || filters.potDiameter != null
}

/** Плоская фильтрация уже полученных строк — без похода в Supabase (данные уже в руках). */
export function applyPotFilters<T extends FilterableRow>(rows: T[], filters: PotFilters): T[] {
  return rows.filter((r) => {
    if (filters.maxPrice != null && !(r.price != null && r.price <= filters.maxPrice)) return false
    if (filters.minQty != null && !(r.qty != null && r.qty >= filters.minQty)) return false
    if (filters.potDiameter != null && r.pot_diameter !== filters.potDiameter) return false
    return true
  })
}

/** Человекочитаемое описание активных фильтров (RU) — для промпта и для честного отказа. */
export function describePotFilters(filters: PotFilters): string {
  const parts: string[] = []
  if (filters.potDiameter != null) parts.push(`диаметр горшка ${filters.potDiameter} см`)
  if (filters.minQty != null) parts.push(`остаток от ${filters.minQty} шт`)
  if (filters.maxPrice != null) parts.push(`цена до ${filters.maxPrice.toLocaleString('ru-RU')} ₸`)
  return parts.join('; ')
}

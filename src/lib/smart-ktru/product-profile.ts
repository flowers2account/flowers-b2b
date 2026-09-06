// Product Profile — сборка characteristics товара из редактируемых строк формы.
// Чистая логика (без React/сети): нормализует значения, проставляет source/verified,
// сохраняет provenance для source:'ai'. Пустые значения ДОПУСТИМЫ (§9) —
// такие строки сохраняются с verified:false, чтобы matching видел «нет данных».

import type { ProductCharacteristic } from './types.ts'

export interface ProfileRowInput {
  name?: string
  value?: string | null
  unit?: string | null
  /** признак, что строка пришла из AI-анализа (есть provenance) */
  fromAi?: boolean
  confidence?: number
  frequency?: number
  totalSpecs?: number
  examples?: string[]
}

const clean = (s: string | null | undefined) => (s ?? '').trim()

/**
 * Редактируемые строки формы → characteristics для Product.
 * Отбрасываются только строки без имени. Пустое значение сохраняется (verified:false).
 */
export function toProfileCharacteristics(rows: ProfileRowInput[]): ProductCharacteristic[] {
  const out: ProductCharacteristic[] = []
  for (const r of rows) {
    const name = clean(r.name)
    if (!name) continue
    const value = clean(r.value)
    const unit = clean(r.unit)

    const ch: ProductCharacteristic = { name }
    if (value) ch.value = value
    if (unit) ch.unit = unit
    ch.source = r.fromAi ? 'ai' : 'user'
    ch.verified = value.length > 0

    if (r.fromAi) {
      if (typeof r.confidence === 'number') ch.confidence = r.confidence
      if (typeof r.frequency === 'number') ch.frequency = r.frequency
      if (typeof r.totalSpecs === 'number') ch.totalSpecs = r.totalSpecs
      if (r.examples && r.examples.length) ch.examples = r.examples.slice(0, 5)
    }
    out.push(ch)
  }
  return out
}

/** Строки, у которых пользователь ввёл значение (для «заполнено N из M»). */
export function countFilled(chars: ProductCharacteristic[]): { filled: number; total: number } {
  return {
    filled: chars.filter((c) => (c.value ?? '').trim().length > 0).length,
    total: chars.length,
  }
}

/**
 * Обратное преобразование: сохранённые characteristics → строки для формы правки
 * (повторный вход в товар, §13). Provenance восстанавливается, значения не теряются.
 */
export function profileToRows(chars: ProductCharacteristic[]): ProfileRowInput[] {
  return chars.map((c) => ({
    name: c.name,
    value: c.value ?? '',
    unit: c.unit ?? '',
    fromAi: c.source === 'ai',
    confidence: c.confidence,
    frequency: c.frequency,
    totalSpecs: c.totalSpecs,
    examples: c.examples,
  }))
}

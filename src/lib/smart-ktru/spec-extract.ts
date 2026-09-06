// Универсальный AI-слой: текст ТС → ExtractedSpecification.
// Один промпт на все категории. Детерминированный код только валидирует и нормализует —
// сам список требований извлекает LLM (Gemini), но НЕ придумывает недостающее.

import { callGemini } from '../gemini.ts'
import { parseTechSpecTable } from '../goszakup/spec.ts'
import type {
  ExtractedSpecification,
  SpecRequirement,
  RequirementType,
} from './types.ts'

const VALID_TYPES: RequirementType[] = ['exact', 'min', 'max', 'range', 'text', 'document', 'presence']

const PROMPT = (specText: string) => `Ты разбираешь техническую спецификацию из государственной закупки Республики Казахстан.
Твоя задача — извлечь СТРУКТУРУ требований к закупаемому товару. Документ может быть двуязычным
(казахский + русский). Разбирай русскую часть, если она есть.

КРИТИЧЕСКИЕ ПРАВИЛА:
1. НИКОГДА не придумывай требования, которых нет в тексте. Если параметра нет — не добавляй его.
2. Каждое требование ОБЯЗАНО иметь поле "rawRequirement" — дословную цитату из текста (можно короткий фрагмент).
3. В "source.text" положи фрагмент исходного текста, из которого взято требование.
4. В тексте подписи и значения часто идут слитно без пробела/двоеточия
   (например "Тип удобренийминеральное", "Форма выпускабрикет") — раздели их по смыслу.
5. Определи тип ограничения "requirementType":
   - "exact"    — требуется точное значение ("диаметр 30 см")
   - "min"      — не менее / не ниже / от / ≥ ("высота не менее 25 см")
   - "max"      — не более / не выше / до / ≤
   - "range"    — диапазон ("20-30 см", "от 20 до 30")
   - "text"     — качественная формулировка или выбор из списка ("материал: пластик")
   - "document" — требуется документ/сертификат ("наличие сертификата соответствия")
   - "presence" — требуется наличие признака (да/нет)
6. "value" — нормализованное значение БЕЗ единицы. Для range: "20-30". Если только текст — null.
7. "unit" — единица измерения отдельно ("см", "мм", "л", "%", "шт") или null.
8. "confidence" — 0..1, насколько ты уверен в этой строке.

Верни СТРОГО JSON по схеме (без markdown):
{
  "productName": string | null,
  "characteristics": [
    { "name": string, "value": string|null, "unit": string|null,
      "requirementType": "exact"|"min"|"max"|"range"|"text"|"document"|"presence",
      "rawRequirement": string, "source": { "text": string }, "confidence": number }
  ],
  "quantity": { "value": number|null, "unit": string|null } | null,
  "delivery": { "place": string|null, "deadline": string|null } | null,
  "documents": string[],
  "otherRequirements": string[]
}

ТЕКСТ ТЕХНИЧЕСКОЙ СПЕЦИФИКАЦИИ:
"""
${specText.slice(0, 12000)}
"""`

/** Чистая нормализация ответа модели → ExtractedSpecification. Без сети — тестируема. */
export function normalizeExtraction(
  raw: unknown,
  opts: { tableRows?: { name: string; value: string }[]; method?: string } = {},
): ExtractedSpecification {
  const warnings: string[] = []
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>

  const rawChars = Array.isArray(obj.characteristics) ? obj.characteristics : []
  const characteristics: SpecRequirement[] = []
  for (const c of rawChars) {
    if (!c || typeof c !== 'object') continue
    const r = c as Record<string, unknown>
    const rawRequirement = str(r.rawRequirement)
    const name = str(r.name)
    if (!rawRequirement || !name) {
      warnings.push(`пропущено требование без name/rawRequirement: ${JSON.stringify(r).slice(0, 80)}`)
      continue // ПРАВИЛО: без дословной цитаты — не факт, отбрасываем
    }
    let type = str(r.requirementType) as RequirementType
    if (!VALID_TYPES.includes(type)) type = 'text'
    const conf = num(r.confidence)
    characteristics.push({
      name,
      value: nullableStr(r.value),
      unit: nullableStr(r.unit),
      requirementType: type,
      rawRequirement,
      source: sourceOf(r.source),
      confidence: conf == null ? undefined : clamp01(conf),
    })
  }

  // Надёжные факты из фиксированной таблицы шаблона (parseTechSpecTable) — добираем, если AI не дал
  let quantity = qtyOf(obj.quantity)
  let delivery = delivOf(obj.delivery)
  if (opts.tableRows?.length) {
    const byName = (n: string) =>
      opts.tableRows!.find((row) => row.name.toLowerCase().includes(n))?.value
    if (quantity?.value == null) {
      const q = byName('количество')
      const qn = q ? parseFloat(q.replace(',', '.')) : NaN
      if (Number.isFinite(qn)) quantity = { value: qn, unit: byName('единица') ?? undefined }
    }
    if (!delivery?.place) {
      const place = byName('места поставки') || byName('место поставки')
      const deadline = byName('срок поставки')
      if (place || deadline) delivery = { place: place ?? undefined, deadline: deadline ?? undefined }
    }
  }

  const documents = uniqStrings(obj.documents).concat(
    characteristics.filter((c) => c.requirementType === 'document').map((c) => c.name),
  )
  const templateRecognized = (opts.tableRows?.length ?? 0) >= 5
  const extractedCount = characteristics.length
  if (extractedCount === 0) warnings.push('AI не извлёк ни одного требования')

  return {
    productName: nullableStr(obj.productName) ?? undefined,
    characteristics,
    quantity: quantity ?? undefined,
    delivery: delivery ?? undefined,
    documents: [...new Set(documents)],
    otherRequirements: uniqStrings(obj.otherRequirements),
    meta: {
      templateRecognized,
      extractedCount,
      warnings,
      method: opts.method ?? (extractedCount ? (opts.tableRows?.length ? 'ai+table' : 'ai') : 'failed'),
    },
  }
}

/** Полный проход: текст ТС → (таблица шаблона) + (LLM) → ExtractedSpecification. */
export async function extractSpecification(specText: string): Promise<ExtractedSpecification> {
  const tableRows = safeParseTable(specText)

  if (!specText || specText.trim().length < 30) {
    return normalizeExtraction({}, { tableRows, method: 'failed' })
  }

  const out = await callGemini(PROMPT(specText), { json: true, temperature: 0, timingLabel: 'ktru-spec-extract' })
  if (!out) {
    // LLM недоступен — отдаём хотя бы факты из таблицы шаблона
    const spec = normalizeExtraction({}, { tableRows, method: 'table-only' })
    spec.meta.warnings.push('AI недоступен (нет ключа/сеть) — только факты из шаблона ТС')
    return spec
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(stripFences(out))
  } catch {
    const spec = normalizeExtraction({}, { tableRows, method: 'failed' })
    spec.meta.warnings.push('AI вернул невалидный JSON — разбор ограничен')
    return spec
  }
  return normalizeExtraction(parsed, { tableRows })
}

// ─────────────────── helpers ───────────────────

function safeParseTable(text: string): { name: string; value: string }[] {
  try {
    return parseTechSpecTable(text).map((r) => ({ name: r.name, value: r.value }))
  } catch {
    return []
  }
}
function stripFences(s: string): string {
  return s.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/i, '').trim()
}
function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim()
}
function nullableStr(v: unknown): string | null {
  const s = str(v)
  return s === '' || s.toLowerCase() === 'null' ? null : s
}
function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : null
}
function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}
function uniqStrings(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return [...new Set(v.map((x) => str(x)).filter(Boolean))]
}
function sourceOf(v: unknown): { page?: number; text?: string } | undefined {
  if (!v || typeof v !== 'object') return undefined
  const r = v as Record<string, unknown>
  const text = nullableStr(r.text) ?? undefined
  const page = num(r.page) ?? undefined
  return text || page != null ? { text, page } : undefined
}
function qtyOf(v: unknown): { value?: number; unit?: string } | undefined {
  if (!v || typeof v !== 'object') return undefined
  const r = v as Record<string, unknown>
  const value = num(r.value) ?? undefined
  const unit = nullableStr(r.unit) ?? undefined
  return value != null || unit ? { value, unit } : undefined
}
function delivOf(v: unknown): { place?: string; deadline?: string } | undefined {
  if (!v || typeof v !== 'object') return undefined
  const r = v as Record<string, unknown>
  const place = nullableStr(r.place) ?? undefined
  const deadline = nullableStr(r.deadline) ?? undefined
  return place || deadline ? { place, deadline } : undefined
}

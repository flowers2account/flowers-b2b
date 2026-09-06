// Smart KTRU — вертикальный срез: товар → закупка → ТС → разбор → сравнение → экономика → рейтинг.
// Ядро (ktru/*, goszakup/*) не трогаем — этот модуль строится поверх него.

// ─────────────────────────── Товар ───────────────────────────

export interface ProductCharacteristic {
  /** «Материал», «Диаметр», «Высота», «Цвет», … — произвольное имя */
  name: string
  /** значение как строка; для числовых — только число («30», не «30 см») */
  value?: string
  /** единица измерения, если применимо: «см», «мм», «л», «шт», … */
  unit?: string

  // ── Product Profile: provenance (все поля опциональны; matching читает только name/value/unit) ──
  /** откуда взялась характеристика: 'ai' — из анализа ТЗ по КТРУ, 'user' — добавлена вручную */
  source?: 'ai' | 'user'
  /** заполнил ли пользователь значение (для matching: false → «нет данных»/pending) */
  verified?: boolean
  /** доля ТЗ, где встречалась характеристика (0..1) — только для source:'ai' */
  confidence?: number
  /** в скольких ТЗ встретилась / всего проанализировано — только для source:'ai' */
  frequency?: number
  totalSpecs?: number
  /** примеры значений-требований из ТЗ (НЕ значение товара) — только для source:'ai' */
  examples?: string[]
}

export interface Product {
  id: string
  name: string
  /** категория товара (для карточки: «Горшки», «Медизделия», …) — необязательно */
  category?: string
  /** себестоимость за единицу, ₸ */
  costPerUnit?: number
  /** как продаётся: «шт», «мешок», «паллета», … (для экономики) */
  saleUnit?: string
  /** произвольные характеристики — универсальны для сопоставления с любой ТС */
  characteristics: ProductCharacteristic[]
  /** подтверждённые/предложенные коды КТРУ */
  ktruCodes?: string[]
  createdAt: string
  updatedAt: string
}

// ─────────────────────── Извлечённая ТС (AI) ───────────────────────

export type RequirementType =
  | 'exact' // точное совпадение значения
  | 'min' // не менее
  | 'max' // не более
  | 'range' // диапазон
  | 'text' // свободная текстовая формулировка
  | 'document' // требуется документ/сертификат
  | 'presence' // требуется наличие признака (да/нет)

export interface SpecRequirement {
  name: string
  /** нормализованное значение требования; для range — «20-30»; null если только текст */
  value?: string | null
  unit?: string | null
  requirementType: RequirementType
  /** дословная формулировка из ТС — обязательна, иначе строка отбрасывается */
  rawRequirement: string
  source?: {
    page?: number
    /** фрагмент исходного текста, к которому привязано требование */
    text?: string
  }
  /** 0..1 — уверенность AI в этой строке */
  confidence?: number
}

export interface ExtractedSpecification {
  productName?: string
  characteristics: SpecRequirement[]
  quantity?: { value?: number; unit?: string }
  delivery?: { place?: string; deadline?: string }
  documents: string[]
  otherRequirements: string[]
  /** служебное: распознан ли шаблон, сколько извлечено, предупреждения */
  meta: {
    templateRecognized: boolean
    extractedCount: number
    warnings: string[]
    /** 'ai' | 'ai+table' | 'table-only' | 'failed' */
    method: string
  }
}

// ─────────────────────── Пользовательские правки разбора ───────────────────────

export type RequirementStatus = 'ai' | 'confirmed' | 'edited' | 'rejected'

export interface ReviewedRequirement extends SpecRequirement {
  status: RequirementStatus
  /** true — добавлено пользователем вручную, не AI */
  userAdded?: boolean
}

// ─────────────────────────── Сравнение ───────────────────────────

export type MatchVerdict =
  | 'match' // соответствует
  | 'mismatch' // не соответствует
  | 'pending' // ожидает подтверждения (нет данных о товаре / неоднозначно)
  | 'not-a-requirement' // справочный пункт, не требование

export interface MatchRow {
  requirement: SpecRequirement
  /** значение из товара, которое сопоставляли (или null) */
  productValue?: string | null
  productUnit?: string | null
  verdict: MatchVerdict
  /** критично ли несоответствие (exact/document/presence/жёсткое число) */
  critical: boolean
  /** человекочитаемое объяснение, как получен вердикт */
  explanation: string
}

export interface MatchResult {
  rows: MatchRow[]
  total: number
  matched: number
  mismatched: number
  pending: number
  criticalMismatches: number
  /** 0..1 — доля выполненных требований среди сопоставимых */
  ratio: number
}

// ─────────────────────────── Экономика ───────────────────────────

export interface EconomicsLine {
  key: string
  label: string
  /** ₸; null — «Нет данных» */
  amount: number | null
  source: string
}

export interface Economics {
  quantity: number | null
  quantityUnit: string | null
  /** цена за единицу, на которой строится расчёт */
  unitPriceBasis: number | null
  unitPriceBasisSource: string
  /** флаг: расчёт опирается на историческую цену */
  usesHistoricalPrice: boolean
  lines: EconomicsLine[]
  revenue: number | null
  directCost: number | null
  logistics: number | null
  otherCost: number | null
  profit: number | null
  /** потенциальная маржа, доля (0.258 = 25.8%) */
  marginRatio: number | null
  warnings: string[]
}

// ─────────────────────────── Рейтинг ───────────────────────────

export type FactorKey =
  | 'compliance'
  | 'margin'
  | 'competition'
  | 'specComplexity'
  | 'deadline'
  | 'logistics'

export type Confidence = 'high' | 'medium' | 'low' | 'none'

export interface ScoreFactor {
  key: FactorKey
  label: string
  /** 0..100; null — «Нет данных» */
  score: number | null
  reason: string
  confidence: Confidence
  source: string
  /** вес в итоговом индексе (0..1) */
  weight: number
}

export type Verdict = 'recommend' | 'consider' | 'unlikely' | 'unsuitable'

export interface ParticipationScore {
  factors: ScoreFactor[]
  /** 0..100, детерминированный */
  participationIndex: number
  verdict: Verdict
  verdictLabel: string
  /** одно-двухфразное объяснение */
  summary: string
  pros: string[]
  cons: string[]
  risks: string[]
}

// ─────────────────────── Итог анализа лота ───────────────────────

export interface LotFacts {
  lotId: number
  lotNumber: string | null
  buyId: number | null
  buyNumberAnno: string | null
  nameRu: string | null
  descriptionRu: string | null
  amount: number | null // сумма закупки/лота, ₸
  count: number | null // количество
  customerBin: string | null
  customerNameRu: string | null
  refLotStatusId: number | null
  statusLabel: string
  tradeMethodId: number | null
  tradeMethodLabel: string
  kato: string | null
  regionLabel: string
  publishDate: string | null
  endDate: string | null
  deadlineDaysLeft: number | null
  deadlinePassed: boolean
  specFile: { name: string | null; url: string; originalName: string | null } | null
}

export interface AnalysisResult {
  productId: string
  productName: string
  facts: LotFacts
  spec: ExtractedSpecification | null
  specText: string | null
  match: MatchResult | null
  economics: Economics
  score: ParticipationScore
  generatedAt: string
  warnings: string[]
}

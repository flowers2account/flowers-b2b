// Presentation / read-model: «возможность участия» в закупке.
//
// Единая плоская модель поверх УЖЕ существующих результатов (analyze.ts →
// AnalysisResult) и сырых данных ленты. Здесь НЕТ новой бизнес-логики и НЕТ AI:
// только агрегация и человекочитаемые ярлыки, чтобы UI отвечал на вопрос
// «стоит ли участвовать?» за несколько секунд.

import type {
  AnalysisResult,
  MatchResult,
  Economics,
  EconomicsLine,
  ParticipationScore,
  Verdict,
} from './types.ts'

export type OpportunityState = 'analyzed' | 'not-analyzed'

export type OppResult = 'match' | 'mismatch' | 'pending'

export interface OppRequirementRow {
  name: string
  requirementType: string
  /** что требует ТЗ: нормализованное значение + единица, либо дословная формулировка */
  requirementText: string
  /** значение из Product Profile (или null — «нет данных») */
  productValue: string | null
  result: OppResult
  resultLabel: string
  critical: boolean
  explanation: string
  /** для mismatch/pending: «Требуется X» / «У товара Y» (null, если неприменимо) */
  needed: string | null
  have: string | null
  /** фрагмент исходного текста ТЗ, если AI его сохранил (номер страницы НЕ выдумываем) */
  source: { text?: string; page?: number } | null
}

export interface OppCompatibility {
  totalRequirements: number
  matched: number
  mismatched: number
  pending: number
  critical: number
  /** доля выполненных среди СРАВНИМЫХ (match+mismatch), 0..100; pending не входит в знаменатель */
  compatibilityPercent: number
  rows: OppRequirementRow[]
}

export interface OppEconomics {
  available: boolean
  /** почему экономика неполная: «нет себестоимости» и т.п. (null — всё ок) */
  unavailableReason: string | null
  unitPrice: number | null
  unitPriceSource: string
  productCost: number | null
  grossProfit: number | null
  marginPercent: number | null
  historicalMedian: number | null
  usesHistoricalPrice: boolean
  revenue: number | null
  lines: EconomicsLine[]
  warnings: string[]
}

export interface OppDecision {
  score: number
  verdict: Verdict
  verdictLabel: string
  summary: string
  reasons: { positive: string[]; negative: string[] }
  risks: string[]
  /** блокирующее несоответствие — «Рекомендуем» при нём невозможно */
  hasCriticalMismatch: boolean
}

export interface OpportunitySummary {
  state: OpportunityState

  /** товар, для которого считалась возможность (только для state:'analyzed') */
  productId: string | null

  // ── Закупка ──
  lotId: number
  buyId: number | null
  lotNumber: string | null
  buyNumberAnno: string | null
  title: string
  description: string | null
  customer: string | null
  region: string | null
  kato: string | null
  quantity: number | null
  unit: string | null
  procurementPrice: number | null
  endDate: string | null
  deadlineDaysLeft: number | null
  deadlinePassed: boolean
  ktruCode: string | null
  tradeMethod: string | null

  // ── Intelligence (null, пока не анализировали) ──
  compatibility: OppCompatibility | null
  economics: OppEconomics | null
  decision: OppDecision | null

  generatedAt: string | null
  warnings: string[]
}

const RESULT_LABEL: Record<OppResult, string> = {
  match: 'Совпадает',
  mismatch: 'Не соответствует',
  pending: 'Требует проверки',
}

function withUnit(v: string | null | undefined, u: string | null | undefined): string | null {
  const val = (v ?? '').trim()
  if (!val) return null
  const unit = (u ?? '').trim()
  return unit ? `${val} ${unit}` : val
}

function buildCompatibility(m: MatchResult): OppCompatibility {
  const rows: OppRequirementRow[] = m.rows.map((row) => {
    const result: OppResult =
      row.verdict === 'match' ? 'match' : row.verdict === 'mismatch' ? 'mismatch' : 'pending'
    const requirementText =
      withUnit(row.requirement.value ?? undefined, row.requirement.unit ?? undefined) ??
      (row.requirement.rawRequirement || '—')
    const productValue = withUnit(row.productValue, row.productUnit)
    return {
      name: row.requirement.name,
      requirementType: row.requirement.requirementType,
      requirementText,
      productValue,
      result,
      resultLabel: RESULT_LABEL[result],
      critical: row.critical,
      explanation: row.explanation,
      needed: result === 'match' ? null : requirementText,
      have: result === 'match' ? null : productValue ?? 'нет данных',
      source: row.requirement.source ?? null,
    }
  })
  return {
    totalRequirements: m.total,
    matched: m.matched,
    mismatched: m.mismatched,
    pending: m.pending,
    critical: m.criticalMismatches,
    compatibilityPercent: Math.round(m.ratio * 100),
    rows,
  }
}

function buildEconomics(e: Economics): OppEconomics {
  const noCost = e.directCost == null || e.revenue == null
  const reason = noCost
    ? e.warnings.find((w) => /себестоимость/i.test(w)) ??
      'Экономика недоступна — у товара не указана себестоимость'
    : null
  const hist = e.lines.find((l) => l.key === 'historical')?.amount ?? null
  return {
    available: !noCost && e.marginRatio != null,
    unavailableReason: reason,
    unitPrice: e.unitPriceBasis,
    unitPriceSource: e.unitPriceBasisSource,
    productCost: e.lines.find((l) => l.key === 'cost')?.amount ?? null,
    grossProfit: e.profit,
    marginPercent: e.marginRatio != null ? Math.round(e.marginRatio * 1000) / 10 : null,
    historicalMedian: hist,
    usesHistoricalPrice: e.usesHistoricalPrice,
    revenue: e.revenue,
    lines: e.lines,
    warnings: e.warnings,
  }
}

function buildDecision(s: ParticipationScore, m: MatchResult | null): OppDecision {
  return {
    score: s.participationIndex,
    verdict: s.verdict,
    verdictLabel: s.verdictLabel,
    summary: s.summary,
    reasons: { positive: s.pros, negative: s.cons },
    risks: s.risks,
    hasCriticalMismatch: (m?.criticalMismatches ?? 0) > 0,
  }
}

/** Полная модель из результата analyze.ts. `ktruCode` — из контекста ленты (facts его не хранит). */
export function opportunityFromAnalysis(res: AnalysisResult, ktruCode?: string | null): OpportunitySummary {
  const f = res.facts
  return {
    state: 'analyzed',
    productId: res.productId ?? null,
    lotId: f.lotId,
    buyId: f.buyId,
    lotNumber: f.lotNumber,
    buyNumberAnno: f.buyNumberAnno,
    title: f.nameRu ?? 'Лот',
    description: f.descriptionRu,
    customer: f.customerNameRu,
    region: f.regionLabel,
    kato: f.kato,
    quantity: f.count,
    unit: res.economics.quantityUnit,
    procurementPrice: f.amount,
    endDate: f.endDate,
    deadlineDaysLeft: f.deadlineDaysLeft,
    deadlinePassed: f.deadlinePassed,
    ktruCode: ktruCode ?? null,
    tradeMethod: f.tradeMethodLabel,
    compatibility: res.match ? buildCompatibility(res.match) : null,
    economics: buildEconomics(res.economics),
    decision: buildDecision(res.score, res.match),
    generatedAt: res.generatedAt,
    warnings: res.warnings,
  }
}

export interface RawLotForOpportunity {
  lotId: number
  buyId?: number | null
  nameRu?: string | null
  descriptionRu?: string | null
  customerNameRu?: string | null
  region?: string | null
  count?: number | null
  unit?: string | null
  amount?: number | null
  endDate?: string | null
  deadlineDaysLeft?: number | null
  deadlinePassed?: boolean
  ktru?: string | null
  trdBuyNumberAnno?: string | null
}

/** «Ещё не анализировали»: только данные закупки, intelligence-блоки = null. */
export function opportunityFromLot(l: RawLotForOpportunity): OpportunitySummary {
  return {
    state: 'not-analyzed',
    productId: null,
    lotId: l.lotId,
    buyId: l.buyId ?? null,
    lotNumber: null,
    buyNumberAnno: l.trdBuyNumberAnno ?? null,
    title: l.nameRu ?? 'Лот',
    description: l.descriptionRu ?? null,
    customer: l.customerNameRu ?? null,
    region: l.region ?? null,
    kato: null,
    quantity: l.count ?? null,
    unit: l.unit ?? null,
    procurementPrice: l.amount ?? null,
    endDate: l.endDate ?? null,
    deadlineDaysLeft: l.deadlineDaysLeft ?? null,
    deadlinePassed: !!l.deadlinePassed,
    ktruCode: l.ktru ?? null,
    tradeMethod: null,
    compatibility: null,
    economics: null,
    decision: null,
    generatedAt: null,
    warnings: [],
  }
}

/** true, если Product Profile изменён ПОСЛЕ последнего анализа (нужен пересчёт). */
export function isAnalysisStale(analysisGeneratedAt: string | null, productUpdatedAt: string | null): boolean {
  if (!analysisGeneratedAt || !productUpdatedAt) return false
  return new Date(productUpdatedAt).getTime() > new Date(analysisGeneratedAt).getTime()
}

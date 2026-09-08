// Aggregation layer «возможности»: закупки, найденные по effective-КТРУ-профилям
// товаров, → список уникальных ProcurementOpportunity (одна закупка = одна карточка,
// задачи #10/#11/#15/#16/#17). Чистые функции, без React/сети/AI/БД.
//
// Порядок (задача #16): retrieval (снаружи, по кодам) → агрегация по lotId здесь →
// дешёвый text-match поверх. НИКАКОГО product×procurement перебора.

import type {
  ProductKtruRole,
  ProcurementOpportunity,
  ProcurementMatchDetail,
  OpportunityMatchReason,
  OpportunityLotFacts,
} from './types.ts'
import { normText } from './matching.ts'

// ── вход ──

export interface AggLot {
  lotId: number
  buyId?: number | null
  nameRu?: string | null
  amount?: number | null
  count?: number | null
  customerNameRu?: string | null
  region?: string | null
  endDate?: string | null
  deadlineDaysLeft?: number | null
  deadlinePassed?: boolean
  trdBuyNumberAnno?: string | null
}

/** Результат одного `GET /api/smart-ktru/procurements?ktru=CODE`, привязанный к его КТРУ-роли. */
export interface FetchedByCode {
  code: string
  role: ProductKtruRole
  origin: 'product' | 'group'
  /** товары, у которых `code` есть в effective-профиле (⇒ все они совпали с этими лотами) */
  productIds: string[]
  lots: AggLot[]
}

export interface AggProductLite {
  id: string
  name: string
  groupId?: string
}

// ── scoring (минимальный детерминированный; отдельной scoring-системы для КТРУ↔закупка нет) ──

const KTRU_WEIGHT: Record<string, { score: number; reason: OpportunityMatchReason }> = {
  'primary:product': { score: 0.95, reason: 'primary_ktru_match' },
  'primary:group': { score: 0.88, reason: 'group_primary_ktru_match' },
  'alternative:product': { score: 0.82, reason: 'alternative_ktru_match' },
  'alternative:group': { score: 0.75, reason: 'group_alternative_ktru_match' },
}
const TEXT_ONLY_SCORE = 0.55

const REASON_ORDER: OpportunityMatchReason[] = [
  'primary_ktru_match',
  'group_primary_ktru_match',
  'alternative_ktru_match',
  'group_alternative_ktru_match',
  'text_match',
]

export function scoreOpportunity(
  matchedKtru: Pick<ProcurementMatchDetail, 'role' | 'origin'>[],
  hasTextMatch: boolean,
): { score: number; reasons: OpportunityMatchReason[] } {
  const reasons = new Set<OpportunityMatchReason>()
  let score = 0
  for (const m of matchedKtru) {
    const w = KTRU_WEIGHT[`${m.role}:${m.origin}`]
    if (!w) continue
    reasons.add(w.reason)
    if (w.score > score) score = w.score
  }
  if (hasTextMatch) {
    reasons.add('text_match')
    if (score === 0) score = TEXT_ONLY_SCORE
  }
  return {
    score: Math.round(score * 1000) / 1000,
    reasons: REASON_ORDER.filter((r) => reasons.has(r)),
  }
}

// ── text-match (дешёвый лексический сигнал, задача #13/#19 — закупку по КТРУ не отбрасываем) ──

const STOP = new Set([
  'поставк', 'закупк', 'услуг', 'работ', 'товар', 'приобретен', 'оказан',
  'нужд', 'госзакуп', 'лот', 'предмет', 'наименован',
])
// компактный набор окончаний — грубый стем, чтобы «горшков»↔«горшок», «пластиковых»↔«пластиковый» сходились
const ENDINGS = ['ами', 'ями', 'ого', 'его', 'ому', 'ему', 'ов', 'ев', 'ах', 'ях', 'ый', 'ий',
  'ая', 'яя', 'ое', 'ее', 'ые', 'ие', 'ой', 'ей', 'ам', 'ям', 'ми', 'а', 'я', 'и', 'ы', 'е', 'о', 'у', 'ю', 'ь']

function stem(w: string): string {
  for (const s of ENDINGS) {
    if (w.length - s.length >= 4 && w.endsWith(s)) return w.slice(0, -s.length)
  }
  return w
}

/** значимые стемы названия (стоп-слова закупок отброшены) */
function stems(s: string | null | undefined): string[] {
  return normText(s)
    .split(' ')
    .map((w) => stem(w.replace(/[.,\-–—]+$/g, '')))
    .filter((w) => w.length >= 4 && !STOP.has(w))
}

/** равенство стемов или общий префикс ≥4 (сглаживает беглую гласную: «горшк»↔«горшок») */
function similar(a: string, b: string): boolean {
  if (a === b) return true
  const n = Math.min(a.length, b.length)
  return n >= 4 && a.slice(0, 4) === b.slice(0, 4) && (a.startsWith(b) || b.startsWith(a) || n >= 5)
}

/** ≥2 близких значимых токена названия закупки и названия товара (задача #13/#19). */
export function textMatch(lotName: string | null | undefined, productName: string | null | undefined): boolean {
  const a = stems(lotName)
  if (a.length === 0) return false
  const b = stems(productName)
  let shared = 0
  const used = new Set<number>()
  for (const bt of b) {
    for (let i = 0; i < a.length; i++) {
      if (used.has(i)) continue
      if (similar(a[i], bt)) { used.add(i); shared++; break }
    }
  }
  return shared >= 2
}

// ── агрегация ──

interface Mut {
  lotId: number
  buyId: number | null
  lot: OpportunityLotFacts
  procurementKtruCodes: Set<string>
  matchedProductIds: Set<string>
  matchedProductGroupIds: Set<string>
  matchedKtru: Map<string, { code: string; role: ProductKtruRole; origin: 'product' | 'group'; productIds: Set<string> }>
  textMatchedProductIds: Set<string>
}

function toFacts(l: AggLot): OpportunityLotFacts {
  return {
    nameRu: l.nameRu ?? null,
    amount: l.amount ?? null,
    count: l.count ?? null,
    customerNameRu: l.customerNameRu ?? null,
    region: l.region ?? null,
    endDate: l.endDate ?? null,
    deadlineDaysLeft: l.deadlineDaysLeft ?? null,
    deadlinePassed: !!l.deadlinePassed,
    trdBuyNumberAnno: l.trdBuyNumberAnno ?? null,
  }
}

export function aggregateOpportunities(
  fetched: FetchedByCode[],
  products: AggProductLite[],
  opts: { generatedAt?: string } = {},
): ProcurementOpportunity[] {
  const generatedAt = opts.generatedAt ?? new Date().toISOString()
  const nameById = new Map(products.map((p) => [p.id, p.name]))
  const groupById = new Map(products.map((p) => [p.id, p.groupId]))
  const byLot = new Map<number, Mut>()

  const ensure = (l: AggLot): Mut => {
    let m = byLot.get(l.lotId)
    if (!m) {
      m = {
        lotId: l.lotId,
        buyId: l.buyId ?? null,
        lot: toFacts(l),
        procurementKtruCodes: new Set(),
        matchedProductIds: new Set(),
        matchedProductGroupIds: new Set(),
        matchedKtru: new Map(),
        textMatchedProductIds: new Set(),
      }
      byLot.set(l.lotId, m)
    }
    return m
  }

  // 1. свернуть все (code, lot, product) в записи по lotId
  for (const f of fetched) {
    for (const l of f.lots) {
      const m = ensure(l)
      m.procurementKtruCodes.add(f.code)
      let detail = m.matchedKtru.get(f.code)
      if (!detail) {
        detail = { code: f.code, role: f.role, origin: f.origin, productIds: new Set() }
        m.matchedKtru.set(f.code, detail)
      } else if (f.role === 'primary' && detail.role !== 'primary') {
        detail.role = 'primary'
        detail.origin = f.origin
      }
      for (const pid of f.productIds) {
        detail.productIds.add(pid)
        m.matchedProductIds.add(pid)
        const gid = groupById.get(pid)
        if (gid) m.matchedProductGroupIds.add(gid)
      }
    }
  }

  // 2. дешёвый text-match поверх уже найденных закупок (не открывает новые лоты)
  for (const m of byLot.values()) {
    for (const p of products) {
      if (m.matchedProductIds.has(p.id)) continue
      if (textMatch(m.lot.nameRu, p.name)) {
        m.textMatchedProductIds.add(p.id)
        m.matchedProductIds.add(p.id)
        if (p.groupId) m.matchedProductGroupIds.add(p.groupId)
      }
    }
  }

  // 3. финализация
  const byName = (a: string, b: string) => (nameById.get(a) ?? a).localeCompare(nameById.get(b) ?? b)
  const out: ProcurementOpportunity[] = []
  for (const m of byLot.values()) {
    const matchedKtru: ProcurementMatchDetail[] = [...m.matchedKtru.values()]
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((d) => ({ code: d.code, role: d.role, origin: d.origin, productIds: [...d.productIds].sort(byName) }))
    const { score, reasons } = scoreOpportunity(matchedKtru, m.textMatchedProductIds.size > 0)
    out.push({
      lotId: m.lotId,
      buyId: m.buyId,
      lot: m.lot,
      procurementKtruCodes: [...m.procurementKtruCodes].sort(),
      matchedProductIds: [...m.matchedProductIds].sort(byName),
      matchedProductGroupIds: [...m.matchedProductGroupIds].sort(),
      matchedKtru,
      matchScore: score,
      matchReasons: reasons,
      generatedAt,
    })
  }
  out.sort((a, b) => b.matchScore - a.matchScore || a.lotId - b.lotId)
  return out
}

// Слой «КТРУ → закупки»: для кода ЕНС ТРУ тянет через GraphQL V3
//   Plans(refEnstruCode) → id пунктов плана → Lots(pointList) [+ вложенный TrdBuy]
// и агрегирует количество/суммы/регионы/заказчиков/сроки. Только чтение, без сохранения.
//
// Не путать с src/lib/ktru/search.ts (локальный текстовый поиск по офлайн-индексу) —
// этот модуль всегда делает живые запросы к API и предполагает наличие GOSZAKUP_TOKEN.

import { gql } from '../goszakup/client.ts'

// «Текущие» статусы лота: опубликован → приём/дополнение заявок → рассмотрение →
// (для аукционных способов) сами торги → формирование протоколов. Завершено (350/360),
// отменено (410/420/430/440) и черновики (110-190) в активные не входят.
// См. goszakup_api_audit.md §3.2 (справочник ref_lots_status снят вживую).
export const ACTIVE_LOT_STATUSES = [210, 220, 230, 240, 245, 250, 260, 270, 280, 285, 290, 300, 310, 320, 325, 330]

const PLAN_PAGE_LIMIT = 200
const LOT_PAGE_LIMIT = 200
const POINT_CHUNK = 100

interface PlanRow {
  id: number
  nameRu: string | null
  amount: number | null
  subjectBiin: string | null
  subjectNameRu: string | null
}

interface LotRow {
  id: number
  nameRu: string | null
  amount: number | null
  count: number | null
  customerBin: string | null
  customerNameRu: string | null
  plnPointKatoList: string[] | null
  refLotStatusId: number | null
  trdBuyNumberAnno: string | null
  lastUpdateDate: string | null
  TrdBuy: { publishDate: string | null; endDate: string | null; refBuyStatusId: number | null } | null
}

export interface RegionAgg {
  kato: string
  lots: number
  amount: number
}

export interface CustomerAgg {
  bin: string
  nameRu: string
  lots: number
  amount: number
}

export interface ActiveLotSample {
  id: number
  nameRu: string
  amount: number
  count: number
  customerBin: string
  customerNameRu: string
  trdBuyNumberAnno: string
  refLotStatusId: number
  publishDate: string | null
  endDate: string | null
  /** КАТО первой указанной точки поставки (для ярлыка региона); null если API не заполнил */
  regionKato: string | null
}

export interface KtruProcurementSummary {
  code: string
  /** наименование КТРУ, взятое из первого попавшегося пункта плана (может отличаться от индекса) */
  nameRu: string
  year: number | 'all'

  plansTotalCount: number // pageInfo.totalCount с учётом фильтра (точное число по API)
  plansFetched: number // сколько реально забрали (может быть меньше при truncated)
  plansTruncated: boolean
  plansTotalAmount: number // сумма Plans.amount по забранным пунктам (плановый бюджет)
  plansDistinctCustomers: number

  lotsTotalFetched: number
  lotsTruncated: boolean
  activeLotsCount: number
  lotsTotalAmount: number
  activeLotsTotalAmount: number

  regions: RegionAgg[] // top N, по числу лотов
  regionsDistinct: number
  customers: CustomerAgg[] // top N по числу лотов (сторона лота — фактический заказчик)
  customersDistinct: number

  dateRange: { minPublish: string | null; maxPublish: string | null }
  activeLotSamples: ActiveLotSample[] // ближайшие по сроку окончания приёма заявок

  activeLotStatuses: number[]
  generatedAt: string
}

export interface ProcurementOptions {
  /** ограничить годом плана (plnPointYear); по умолчанию — текущий год */
  year?: number | 'all'
  /** предохранитель от случайного вытягивания сотен тысяч пунктов плана */
  maxPlans?: number
  /** предохранитель по количеству лотов */
  maxLots?: number
  /** сколько топ-строк региона/заказчика оставлять в summary */
  topN?: number
  /** сколько активных лотов показать (ближайшие сроки) */
  activeSampleSize?: number
  onProgress?: (msg: string) => void
}

export async function getKtruProcurement(
  code: string,
  opts: ProcurementOptions = {},
): Promise<KtruProcurementSummary> {
  const year = opts.year ?? new Date().getFullYear()
  const maxPlans = opts.maxPlans ?? 4000
  const maxLots = opts.maxLots ?? 6000
  const topN = opts.topN ?? 5
  const activeSampleSize = opts.activeSampleSize ?? 10
  const log = opts.onProgress ?? (() => {})

  // ---- 1. Пункты плана по коду КТРУ ----
  const yearFilter = year === 'all' ? '' : `plnPointYear:[${year}], `
  const plans: PlanRow[] = []
  let after = 0
  let plansTotalCount = 0
  let plansTruncated = false
  for (;;) {
    const r = await gql<{ Plans: PlanRow[] | null }>(
      `{ Plans(filter:{ ${yearFilter}refEnstruCode:"${escapeGql(code)}" }, limit:${PLAN_PAGE_LIMIT}, after:${after}){
        id nameRu amount subjectBiin subjectNameRu } }`,
    )
    plansTotalCount = r.extensions?.pageInfo?.totalCount ?? plansTotalCount
    const rows = r.data?.Plans ?? []
    plans.push(...rows)
    log(`Plans: ${plans.length}/${plansTotalCount}`)
    const pi = r.extensions?.pageInfo
    if (!pi?.hasNextPage || !rows.length) break
    if (plans.length >= maxPlans) {
      plansTruncated = true
      break
    }
    after = pi.lastId
  }

  const nameRu = plans.find((p) => p.nameRu)?.nameRu ?? code
  const plansTotalAmount = sum(plans.map((p) => p.amount ?? 0))
  const plansDistinctCustomers = new Set(plans.map((p) => p.subjectBiin).filter(Boolean)).size

  // ---- 2. Лоты по этим пунктам плана (батчами по 100 id) ----
  const ids = plans.map((p) => p.id)
  const lots: LotRow[] = []
  let lotsTruncated = false
  outer: for (let i = 0; i < ids.length; i += POINT_CHUNK) {
    const chunk = ids.slice(i, i + POINT_CHUNK)
    let lafter = 0
    for (;;) {
      const r = await gql<{ Lots: LotRow[] | null }>(
        `{ Lots(filter:{ pointList:[${chunk.join(',')}] }, limit:${LOT_PAGE_LIMIT}, after:${lafter}){
          id nameRu amount count customerBin customerNameRu plnPointKatoList refLotStatusId
          trdBuyNumberAnno lastUpdateDate
          TrdBuy{ publishDate endDate refBuyStatusId } } }`,
      )
      const rows = r.data?.Lots ?? []
      lots.push(...rows)
      log(`Lots: ${lots.length} (пунктов плана обработано ${Math.min(i + chunk.length, ids.length)}/${ids.length})`)
      const pi = r.extensions?.pageInfo
      if (lots.length >= maxLots) {
        lotsTruncated = true
        break outer
      }
      if (!pi?.hasNextPage || !rows.length) break
      lafter = pi.lastId
    }
  }
  // pointList — массив (лот может числиться по нескольким пунктам); на всякий случай
  // дедуплицируем по id лота, если один лот пришёл из нескольких чанков.
  const dedupLots = dedupeBy(lots, (l) => l.id)

  const activeSet = new Set(ACTIVE_LOT_STATUSES)
  const activeLots = dedupLots.filter((l) => l.refLotStatusId != null && activeSet.has(l.refLotStatusId))

  const lotsTotalAmount = sum(dedupLots.map((l) => l.amount ?? 0))
  const activeLotsTotalAmount = sum(activeLots.map((l) => l.amount ?? 0))

  // ---- 3. Агрегаты: регионы, заказчики, даты ----
  // У заметной доли лотов plnPointKatoList приходит как [""] (КАТО в API не заполнен,
  // не ошибка нашей агрегации) — сводим такие в явный сентинел, а не пустую строку.
  const NO_KATO = '(не указан)'
  const regionMap = new Map<string, { lots: number; amount: number }>()
  for (const l of dedupLots) {
    const katoList = (l.plnPointKatoList ?? []).filter((k) => k != null)
    const keys = katoList.length ? katoList.map((k) => (k.trim() ? k : NO_KATO)) : [NO_KATO]
    for (const kato of new Set(keys)) {
      const e = regionMap.get(kato) ?? { lots: 0, amount: 0 }
      e.lots++
      e.amount += l.amount ?? 0
      regionMap.set(kato, e)
    }
  }
  const regions: RegionAgg[] = [...regionMap.entries()]
    .map(([kato, v]) => ({ kato, lots: v.lots, amount: v.amount }))
    .sort((a, b) => b.lots - a.lots)

  const custMap = new Map<string, { nameRu: string; lots: number; amount: number }>()
  for (const l of dedupLots) {
    if (!l.customerBin) continue
    const e = custMap.get(l.customerBin) ?? { nameRu: l.customerNameRu ?? '', lots: 0, amount: 0 }
    e.lots++
    e.amount += l.amount ?? 0
    custMap.set(l.customerBin, e)
  }
  const customers: CustomerAgg[] = [...custMap.entries()]
    .map(([bin, v]) => ({ bin, nameRu: v.nameRu, lots: v.lots, amount: v.amount }))
    .sort((a, b) => b.lots - a.lots)

  const publishDates = dedupLots.map((l) => l.TrdBuy?.publishDate).filter((x): x is string => !!x).sort()
  const dateRange = {
    minPublish: publishDates[0] ?? null,
    maxPublish: publishDates[publishDates.length - 1] ?? null,
  }

  const activeLotSamples: ActiveLotSample[] = activeLots
    .slice()
    .sort((a, b) => {
      const ea = a.TrdBuy?.endDate ?? '9999'
      const eb = b.TrdBuy?.endDate ?? '9999'
      return ea.localeCompare(eb)
    })
    .slice(0, activeSampleSize)
    .map((l) => ({
      id: l.id,
      nameRu: l.nameRu ?? '',
      amount: l.amount ?? 0,
      count: l.count ?? 0,
      customerBin: l.customerBin ?? '',
      customerNameRu: l.customerNameRu ?? '',
      trdBuyNumberAnno: l.trdBuyNumberAnno ?? '',
      refLotStatusId: l.refLotStatusId ?? 0,
      publishDate: l.TrdBuy?.publishDate ?? null,
      endDate: l.TrdBuy?.endDate ?? null,
      regionKato: (l.plnPointKatoList ?? []).find((k) => k != null && k.trim() !== '') ?? null,
    }))

  return {
    code,
    nameRu,
    year,
    plansTotalCount,
    plansFetched: plans.length,
    plansTruncated,
    plansTotalAmount,
    plansDistinctCustomers,
    lotsTotalFetched: dedupLots.length,
    lotsTruncated,
    activeLotsCount: activeLots.length,
    lotsTotalAmount,
    activeLotsTotalAmount,
    regions: regions.slice(0, topN),
    regionsDistinct: regions.length,
    customers: customers.slice(0, topN),
    customersDistinct: customers.length,
    dateRange,
    activeLotSamples,
    activeLotStatuses: ACTIVE_LOT_STATUSES,
    generatedAt: new Date().toISOString(),
  }
}

function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0)
}

function dedupeBy<T>(xs: T[], key: (x: T) => unknown): T[] {
  const seen = new Set<unknown>()
  const out: T[] = []
  for (const x of xs) {
    const k = key(x)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(x)
  }
  return out
}

// Код КТРУ — цифры и точки, экранировать по факту нечего, но на всякий случай
// не пускаем в строку запроса кавычки/переводы строк.
function escapeGql(s: string): string {
  return s.replace(/["\\\n\r]/g, '')
}

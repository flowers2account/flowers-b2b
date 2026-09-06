// Историческая цена за единицу по КТРУ (медиана по завершённым контрактам).
// Цепочка: Plans(refEnstruCode, прошлые годы) → Lots(pointList) → distinct trdBuyId →
// Contract(trdBuyId) → ContractUnits[].itemPrice. Ограничена по объёму (быстрый on-demand).

import { gql } from '../goszakup/client.ts'

export interface HistoricalPrice {
  unitPrice: number
  /** число контрактных позиций в выборке */
  sampleSize: number
  /** число различных поставщиков-победителей (для оценки конкуренции) */
  distinctWinners: number
  years: number[]
  source: string
}

interface Opts {
  /** от какого года считать «прошлые» (по умолчанию — текущий) */
  currentYear?: number
  yearsBack?: number
  maxPlanPoints?: number
  maxBuys?: number
}

export async function getHistoricalContractPrice(
  ktruCode: string,
  opts: Opts = {},
): Promise<HistoricalPrice | null> {
  const cur = opts.currentYear ?? new Date().getFullYear()
  const back = opts.yearsBack ?? 2
  const years = Array.from({ length: back }, (_, i) => cur - 1 - i)
  const maxPP = opts.maxPlanPoints ?? 150
  const maxBuys = opts.maxBuys ?? 120

  // 1. пункты плана за прошлые годы
  const p = await gql<{ Plans: { id: number }[] | null }>(
    `{ Plans(filter:{ refEnstruCode:"${sanitize(ktruCode)}", plnPointYear:[${years.join(',')}] }, limit:${Math.min(maxPP, 200)}){ id } }`,
  )
  const pointIds = (p.data?.Plans ?? []).map((x) => x.id)
  if (pointIds.length === 0) return null

  // 2. завершённые лоты по этим пунктам → trdBuyId
  const buys = new Set<number>()
  for (let i = 0; i < pointIds.length && buys.size < maxBuys; i += 100) {
    const chunk = pointIds.slice(i, i + 100)
    const l = await gql<{ Lots: { trdBuyId: number; refLotStatusId: number }[] | null }>(
      `{ Lots(filter:{ pointList:[${chunk.join(',')}], refLotStatusId:[350,360] }, limit:200){ trdBuyId refLotStatusId } }`,
    )
    for (const row of l.data?.Lots ?? []) if (row.trdBuyId) buys.add(row.trdBuyId)
  }
  if (buys.size === 0) return null

  // 3. контракты по этим объявлениям → цены за единицу
  const prices: number[] = []
  const winners = new Set<string>()
  const buyArr = [...buys].slice(0, maxBuys)
  for (let i = 0; i < buyArr.length; i += 60) {
    const chunk = buyArr.slice(i, i + 60)
    const c = await gql<{
      Contract:
        | {
            supplierBiin: string | null
            refContractStatusId: number | null
            ContractUnits:
              | { itemPrice: number | null; itemPriceWnds: number | null; quantity: number | null; totalSum: number | null }[]
              | null
          }[]
        | null
    }>(
      `{ Contract(filter:{ trdBuyId:[${chunk.join(',')}] }, limit:200){
        supplierBiin refContractStatusId
        ContractUnits{ itemPrice itemPriceWnds quantity totalSum }
      } }`,
    )
    for (const ct of c.data?.Contract ?? []) {
      if (ct.supplierBiin) winners.add(ct.supplierBiin)
      for (const u of ct.ContractUnits ?? []) {
        const per =
          u.itemPrice ||
          u.itemPriceWnds ||
          (u.quantity && u.totalSum ? u.totalSum / u.quantity : null)
        if (per && per > 0) prices.push(per)
      }
    }
  }

  if (prices.length < 3) return null
  prices.sort((a, b) => a - b)
  const median = prices[Math.floor(prices.length / 2)]
  return {
    unitPrice: Math.round(median),
    sampleSize: prices.length,
    distinctWinners: winners.size,
    years,
    source: `медиана ${prices.length} контрактных позиций по КТРУ ${ktruCode} за ${years.join('–')}`,
  }
}

function sanitize(s: string): string {
  return s.replace(/["\\\n\r]/g, '')
}

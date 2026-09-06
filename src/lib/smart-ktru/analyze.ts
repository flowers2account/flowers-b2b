// Оркестратор вертикального среза: lotId + product → AnalysisResult.
// Собирает вместе ядро (goszakup/spec, ktru) + новые слои (extract, match, history, economics, scoring).

import { gql } from '../goszakup/client.ts'
import { getLotContext, pickTechSpecFile, downloadFile, extractPdfText } from '../goszakup/spec.ts'
import { extractSpecification } from './spec-extract.ts'
import { matchProductToSpec } from './matching.ts'
import { getHistoricalContractPrice } from './history.ts'
import { computeEconomics } from './economics.ts'
import { computeParticipationScore } from './scoring.ts'
import { lotStatusLabel, tradeMethodLabel, regionLabel } from './refs.ts'
import type { Product, AnalysisResult, LotFacts, ExtractedSpecification, MatchResult } from './types.ts'

export interface AnalyzeInput {
  lotId: number
  product: Product
  /** код КТРУ (из ленты закупок); нужен для исторической цены и конкуренции */
  ktruCode?: string
  /** необязательные финансовые параметры */
  taxRatio?: number
  taxLabel?: string
  logistics?: number
  logisticsSource?: string
  deliveryZones?: string[] // коды КАТО областей, куда возит поставщик
  targetMargin?: number
  /** пропустить AI-разбор (для отладки/оффлайна) */
  skipAi?: boolean
}

interface TrdBuyExtra {
  publishDate: string | null
  endDate: string | null
  refBuyStatusId: number | null
  refTradeMethodsId: number | null
  kato: string[] | null
}

export async function analyzeLot(inp: AnalyzeInput): Promise<AnalysisResult> {
  const warnings: string[] = []
  const ctx = await getLotContext(inp.lotId)
  if (!ctx) throw new Error(`Лот ${inp.lotId} не найден`)

  // добор полей TrdBuy, которых нет в getLotContext
  let extra: TrdBuyExtra = { publishDate: null, endDate: null, refBuyStatusId: null, refTradeMethodsId: null, kato: null }
  if (ctx.buyId) {
    const r = await gql<{ TrdBuy: TrdBuyExtra[] | null }>(
      `{ TrdBuy(filter:{ id:[${ctx.buyId}] }, limit:1){ publishDate endDate refBuyStatusId refTradeMethodsId kato } }`,
    )
    if (r.data?.TrdBuy?.[0]) extra = r.data.TrdBuy[0]
  }

  const lotKato = (extra.kato ?? []).find((k) => k && k.trim()) ?? null

  const now = new Date()
  const end = extra.endDate ? new Date(extra.endDate.replace(' ', 'T')) : null
  const deadlineDaysLeft = end
    ? Math.ceil((end.getTime() - now.getTime()) / 86_400_000)
    : null
  const deadlinePassed = end ? end.getTime() < now.getTime() : false

  const specFileRef = pickTechSpecFile(ctx.lotFiles) ?? pickTechSpecFile(ctx.buyFiles) ?? null

  const facts: LotFacts = {
    lotId: ctx.lotId,
    lotNumber: ctx.lotNumber,
    buyId: ctx.buyId,
    buyNumberAnno: ctx.buyNumberAnno,
    nameRu: ctx.nameRu,
    descriptionRu: ctx.descriptionRu,
    amount: ctx.amount,
    count: ctx.count,
    customerBin: ctx.customerBin,
    customerNameRu: ctx.customerNameRu,
    refLotStatusId: ctx.refLotStatusId,
    statusLabel: lotStatusLabel(ctx.refLotStatusId),
    tradeMethodId: extra.refTradeMethodsId,
    tradeMethodLabel: tradeMethodLabel(extra.refTradeMethodsId),
    kato: lotKato,
    regionLabel: regionLabel(lotKato),
    publishDate: extra.publishDate,
    endDate: extra.endDate,
    deadlineDaysLeft,
    deadlinePassed,
    specFile: specFileRef
      ? { name: specFileRef.nameRu, url: specFileRef.filePath, originalName: specFileRef.originalName }
      : null,
  }

  // ── ТС: скачать → текст → AI-разбор ──
  let spec: ExtractedSpecification | null = null
  let specText: string | null = null
  if (specFileRef && !inp.skipAi) {
    try {
      const buf = await downloadFile(specFileRef.filePath)
      const { text } = await extractPdfText(buf)
      specText = text
      spec = await extractSpecification(text)
    } catch (e) {
      warnings.push(`Не удалось разобрать ТС: ${e instanceof Error ? e.message : String(e)}`)
    }
  } else if (!specFileRef) {
    warnings.push('К лоту не приложена техническая спецификация — оценка соответствия недоступна')
  }

  // ── сравнение ──
  let match: MatchResult | null = null
  if (spec && spec.characteristics.length > 0) {
    match = matchProductToSpec(inp.product, spec.characteristics)
  }

  // ── историческая цена / конкуренция ──
  const ktru = inp.ktruCode ?? inp.product.ktruCodes?.[0] ?? null
  let historical = null as Awaited<ReturnType<typeof getHistoricalContractPrice>>
  if (ktru) {
    try {
      historical = await getHistoricalContractPrice(ktru)
    } catch (e) {
      warnings.push(`История контрактов недоступна: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // ── экономика ──
  const economics = computeEconomics({
    quantity: facts.count,
    quantityUnit: null,
    lotAmount: facts.amount,
    costPerUnit: inp.product.costPerUnit ?? null,
    historicalUnitPrice: historical?.unitPrice ?? null,
    historicalSource: historical?.source,
    logistics: inp.logistics ?? null,
    logisticsSource: inp.logisticsSource,
    taxRatio: inp.taxRatio ?? null,
    taxLabel: inp.taxLabel,
  })

  // ── рейтинг ──
  const regionKnown = !!lotKato
  const regionInZone =
    regionKnown && inp.deliveryZones?.length
      ? inp.deliveryZones.some((z) => lotKato!.startsWith(z.slice(0, 2)))
      : null

  const score = computeParticipationScore({
    match,
    economics,
    spec,
    deadlineDaysLeft,
    deadlinePassed,
    tradeMethodId: extra.refTradeMethodsId,
    lotAmount: facts.amount,
    regionKnown,
    regionInZone,
    historicalDistinctWinners: historical?.distinctWinners ?? null,
    historicalSampleSize: historical?.sampleSize ?? null,
    targetMargin: inp.targetMargin,
  })

  return {
    productId: inp.product.id,
    productName: inp.product.name,
    facts,
    spec,
    specText,
    match,
    economics,
    score,
    generatedAt: new Date().toISOString(),
    warnings,
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { analyzeLot } from '@/lib/smart-ktru/analyze'
import type { Product } from '@/lib/smart-ktru/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

// POST /api/smart-ktru/analyze
// body: { lotId, product, ktruCode?, taxRatio?, taxLabel?, logistics?, deliveryZones?, targetMargin? }
//   → AnalysisResult

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'невалидный JSON' }, { status: 400 })
  }
  const lotId = Number(body.lotId)
  const product = body.product as Product | undefined
  if (!Number.isFinite(lotId) || !product || !Array.isArray(product.characteristics)) {
    return NextResponse.json({ error: 'нужны lotId (число) и product с characteristics[]' }, { status: 400 })
  }

  try {
    const result = await analyzeLot({
      lotId,
      product,
      ktruCode: typeof body.ktruCode === 'string' ? body.ktruCode : undefined,
      taxRatio: typeof body.taxRatio === 'number' ? body.taxRatio : undefined,
      taxLabel: typeof body.taxLabel === 'string' ? body.taxLabel : undefined,
      logistics: typeof body.logistics === 'number' ? body.logistics : undefined,
      logisticsSource: typeof body.logisticsSource === 'string' ? body.logisticsSource : undefined,
      deliveryZones: Array.isArray(body.deliveryZones) ? (body.deliveryZones as string[]) : undefined,
      targetMargin: typeof body.targetMargin === 'number' ? body.targetMargin : undefined,
      skipAi: body.skipAi === true,
    })
    return NextResponse.json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `анализ не удался: ${msg}` }, { status: 502 })
  }
}

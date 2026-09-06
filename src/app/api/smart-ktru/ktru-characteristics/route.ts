import { NextRequest, NextResponse } from 'next/server'
import {
  buildKtruCharacteristics,
  ANALYZER_VERSION,
  type KtruCharacteristicsResult,
} from '@/lib/smart-ktru/ktru-characteristics'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

// POST /api/smart-ktru/ktru-characteristics
//   body: { ktruCodes: string[], mainThreshold?: number, minThreshold?: number }
//   → KtruCharacteristicsResult + { usedKtruCode, ignoredKtruCodes }
//
// §16: используем ПЕРВЫЙ выбранный КТРУ — характеристики разных категорий не смешиваем.
// §12: серверный кэш по (analyzerVersion + code), чтобы не гонять разбор ТЗ повторно.

const TTL_MS = 6 * 60 * 60 * 1000
const cache = new Map<string, { at: number; data: KtruCharacteristicsResult }>()

function cacheKey(code: string) {
  return `ktru-characteristics:${ANALYZER_VERSION}:${code}`
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'ожидается JSON' }, { status: 400 })
  }

  const b = (body ?? {}) as { ktruCodes?: unknown; mainThreshold?: unknown; minThreshold?: unknown }
  const codes = Array.isArray(b.ktruCodes)
    ? (b.ktruCodes as unknown[]).map((c) => String(c ?? '').trim()).filter(Boolean)
    : []
  if (codes.length === 0) {
    return NextResponse.json({ error: 'нужен непустой ktruCodes' }, { status: 400 })
  }
  const usedKtruCode = codes[0]
  const ignoredKtruCodes = codes.slice(1)

  const mainThreshold =
    typeof b.mainThreshold === 'number' && b.mainThreshold > 0 && b.mainThreshold <= 1
      ? b.mainThreshold
      : undefined
  const minThreshold =
    typeof b.minThreshold === 'number' && b.minThreshold >= 0 && b.minThreshold <= 1
      ? b.minThreshold
      : undefined

  const key = cacheKey(usedKtruCode)
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) {
    return NextResponse.json({ ...hit.data, usedKtruCode, ignoredKtruCodes, cached: true })
  }

  try {
    const data = await buildKtruCharacteristics(usedKtruCode, { mainThreshold, minThreshold })
    cache.set(key, { at: Date.now(), data })
    return NextResponse.json({ ...data, usedKtruCode, ignoredKtruCodes, cached: false })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { error: `не удалось проанализировать ТЗ: ${msg}` },
      { status: 502 },
    )
  }
}

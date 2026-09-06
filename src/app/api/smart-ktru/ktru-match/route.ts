import { NextRequest, NextResponse } from 'next/server'
import { matchKtru, type MatchCharacteristic } from '@/lib/ktru/match'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs' // нужен fs для чтения локального индекса КТРУ

// Auto KTRU Match — подбор КТРУ по карточке товара. Детерминированно, БЕЗ Gemini.
//
// POST /api/smart-ktru/ktru-match
//   body: { name: string, characteristics?: { name?, value?, unit? }[] }
//   → { query, results: { code, name, score, confidence, reason }[], confident }
//
// confident=false → фронт показывает «Не удалось уверенно подобрать КТРУ»
// и предлагает ручной ввод.

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'ожидается JSON' }, { status: 400 })
  }

  const b = (body ?? {}) as { name?: unknown; characteristics?: unknown }
  const name = typeof b.name === 'string' ? b.name.trim() : ''
  if (!name) {
    return NextResponse.json({ error: 'параметр name обязателен' }, { status: 400 })
  }

  const characteristics: MatchCharacteristic[] = Array.isArray(b.characteristics)
    ? (b.characteristics as unknown[])
        .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
        .map((c) => ({
          name: typeof c.name === 'string' ? c.name : undefined,
          value: typeof c.value === 'string' ? c.value : undefined,
          unit: typeof c.unit === 'string' ? c.unit : undefined,
        }))
    : []

  try {
    const out = matchKtru(name, characteristics)
    return NextResponse.json(out)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `подбор КТРУ недоступен: ${msg}` }, { status: 503 })
  }
}

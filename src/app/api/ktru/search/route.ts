import { NextRequest, NextResponse } from 'next/server'
import { searchKtru } from '@/lib/ktru/search'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs' // нужен fs для чтения локального индекса

// Умный поиск КТРУ/ЕНС ТРУ v1 (детерминированный, без AI).
//
// GET /api/ktru/search?q=грунт%20для%20цветов&limit=10
//   → { query, count, results: KtruSearchResult[] }
//
// Индекс — data/enstru/enstru_index.json (частичный, собран из планов goszakup).

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const q = (sp.get('q') ?? '').trim()
  if (!q) {
    return NextResponse.json({ error: 'параметр q обязателен' }, { status: 400 })
  }
  const limit = Math.min(Math.max(parseInt(sp.get('limit') ?? '10', 10) || 10, 1), 50)

  try {
    const results = searchKtru(q, { limit })
    return NextResponse.json({ query: q, count: results.length, results })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // чаще всего — отсутствует data/enstru/enstru_index.json
    return NextResponse.json({ error: `ktru index недоступен: ${msg}` }, { status: 503 })
  }
}

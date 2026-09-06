import { NextRequest, NextResponse } from 'next/server'
import { searchKtru } from '@/lib/ktru/search'
import { getKtruProcurement } from '@/lib/ktru/procurement'
import { regionLabel, lotStatusLabel } from '@/lib/smart-ktru/refs'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

// GET /api/smart-ktru/procurements?ktru=222929.900.000114
// GET /api/smart-ktru/procurements?q=горшок пластиковый   (резолвится в КТРУ через searchKtru)
//   → { ktru, resolvedFrom, nameRu, counts, lots: [...] }

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  let ktru = (sp.get('ktru') ?? '').trim()
  const q = (sp.get('q') ?? '').trim()
  let resolvedFrom: 'explicit' | 'search' = 'explicit'
  let searchScore: number | null = null

  if (!ktru && q) {
    const hits = searchKtru(q, { limit: 1 })
    if (!hits.length) {
      return NextResponse.json({ error: `по запросу «${q}» КТРУ не найден` }, { status: 404 })
    }
    ktru = hits[0].code
    resolvedFrom = 'search'
    searchScore = hits[0].score
  }
  if (!ktru) {
    return NextResponse.json({ error: 'нужен параметр ktru или q' }, { status: 400 })
  }

  try {
    const year = Number(sp.get('year')) || new Date().getFullYear()
    const includePassed = sp.get('includePassed') === '1'
    const summary = await getKtruProcurement(ktru, { year, activeSampleSize: 60 })
    const now = Date.now()
    const allLots = summary.activeLotSamples.map((l) => {
      const end = l.endDate ? new Date(l.endDate.replace(' ', 'T')).getTime() : null
      const daysLeft = end ? Math.ceil((end - now) / 86_400_000) : null
      return {
        lotId: l.id,
        nameRu: l.nameRu,
        amount: l.amount,
        count: l.count,
        customerBin: l.customerBin,
        customerNameRu: l.customerNameRu,
        trdBuyNumberAnno: l.trdBuyNumberAnno,
        statusLabel: lotStatusLabel(l.refLotStatusId),
        region: regionLabel(l.regionKato),
        publishDate: l.publishDate,
        endDate: l.endDate,
        deadlineDaysLeft: daysLeft,
        deadlinePassed: end ? end < now : false,
      }
    })
    // «Подходящие живые закупки»: по умолчанию прячем лоты с уже прошедшим сроком
    // (статус в реестре «активный», но приём заявок закрыт — известная особенность данных).
    const live = allLots.filter((l) => !l.deadlinePassed)
    const lots = (includePassed ? allLots : live).sort(
      (a, b) => (a.deadlineDaysLeft ?? 1e9) - (b.deadlineDaysLeft ?? 1e9),
    )
    return NextResponse.json({
      ktru,
      resolvedFrom,
      searchScore,
      nameRu: summary.nameRu,
      year: summary.year,
      counts: {
        plans: summary.plansTotalCount,
        lots: summary.lotsTotalFetched,
        activeLots: summary.activeLotsCount,
        liveLots: live.length,
      },
      lots,
      regionsHint: summary.regions.slice(0, 3).map((r) => ({
        region: regionLabel(r.kato === '(не указан)' ? null : r.kato),
        lots: r.lots,
      })),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `не удалось получить закупки: ${msg}` }, { status: 502 })
  }
}

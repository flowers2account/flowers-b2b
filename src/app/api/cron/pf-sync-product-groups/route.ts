import { NextRequest, NextResponse } from 'next/server'
import { syncProductGroups } from '@/lib/proflowers/product-groups'

export const dynamic = 'force-dynamic'

// Обход листьев pf_catalog_groups → pf_product_groups. ДОРОГОЙ (десятки запросов, один на
// каждый лист подкатегории) — НЕ вешать на основной 3-часовой /api/cron/pf-sync. Отдельный,
// редкий крон (напр. раз в сутки ночью — см. docs/PROFLOWERS_SYNC.md), категория товара
// меняется нечасто. Защита — Bearer CRON_SECRET, как остальные /api/cron/*.
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const logLines: string[] = []
  const log = (message: string) => logLines.push(message)

  try {
    const result = await syncProductGroups(log)
    return NextResponse.json({ ...result, log: logLines })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('pf-sync-product-groups: прогон упал', error)
    return NextResponse.json({ error: message, log: logLines }, { status: 500 })
  }
}

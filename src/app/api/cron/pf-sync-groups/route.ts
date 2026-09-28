import { NextRequest, NextResponse } from 'next/server'
import { syncCatalogGroups } from '@/lib/proflowers/groups'

export const dynamic = 'force-dynamic'

// Дерево подкатегорий Proflowers (pf_catalog_groups) — дешёвый запрос (ipp=1 на номенклатуру
// активного дня), отдельно от дорогого обхода pf_product_groups (см. /api/cron/pf-sync-product-groups,
// шаг 2). Защита — Bearer CRON_SECRET, как остальные /api/cron/*. Расписание — вместе с
// основным синком или отдельно редко; дерево меняется нечасто.
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const logLines: string[] = []
  const log = (message: string) => logLines.push(message)

  try {
    const result = await syncCatalogGroups(log)
    return NextResponse.json({ ...result, log: logLines })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('pf-sync-groups: прогон упал', error)
    return NextResponse.json({ error: message, log: logLines }, { status: 500 })
  }
}

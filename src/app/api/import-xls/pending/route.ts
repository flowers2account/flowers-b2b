export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthedWithRole } from '@/lib/api-auth'

/**
 * Незакрытые выгрузки в staging (stock_import_rows): для блока «Входящие выгрузки»
 * на вкладке /admin «Остатки». Группировка по import_id+source, counts по статусам.
 * Только строки status IN ('unmatched','matched') — applied/superseded/skipped не считаются.
 */
export async function GET(req: NextRequest) {
  const authed = await getAuthedWithRole(req, ['admin', 'manager'])
  if (!authed) return NextResponse.json({ error: 'Доступ запрещён' }, { status: 403 })

  const supabase = await createClient()

  // лёгкие поля + пагинация (PostgREST max_rows=1000)
  type Row = { import_id: number; source: string | null; status: string; created_at: string }
  const all: Row[] = []
  for (let from = 0; ; from += 1000) {
    const { data: page, error } = await supabase
      .from('stock_import_rows')
      .select('import_id, source, status, created_at')
      .in('status', ['unmatched', 'matched'])
      .order('created_at', { ascending: false })
      .range(from, from + 999)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!page || page.length === 0) break
    all.push(...(page as Row[]))
    if (page.length < 1000) break
  }

  const groups = new Map<number, {
    import_id: number; source: string | null
    total: number; matched: number; unmatched: number; last_at: string
  }>()
  for (const r of all) {
    let g = groups.get(r.import_id)
    if (!g) {
      g = { import_id: r.import_id, source: r.source, total: 0, matched: 0, unmatched: 0, last_at: r.created_at }
      groups.set(r.import_id, g)
    }
    g.total++
    if (r.status === 'matched') g.matched++
    else g.unmatched++
    if (r.created_at > g.last_at) g.last_at = r.created_at
  }

  const imports = [...groups.values()].sort((a, b) => b.last_at.localeCompare(a.last_at))
  return NextResponse.json({ imports })
}

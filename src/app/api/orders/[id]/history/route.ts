import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: historyData } = await supabase
    .from('order_history')
    .select('*')
    .eq('order_id', Number(id))
    .order('created_at', { ascending: true })

  if (!historyData?.length) return NextResponse.json([])

  const changedByIds = [...new Set(historyData.map((h: any) => h.changed_by).filter(Boolean))]

  let profileMap: Record<string, string> = {}
  if (changedByIds.length > 0) {
    const admin = createAdminClient()
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, display_name')
      .in('id', changedByIds)
    profileMap = Object.fromEntries((profiles ?? []).map((p: any) => [p.id, p.display_name]))
  }

  const result = historyData.map((h: any) => ({
    ...h,
    manager_name: h.changed_by ? (profileMap[h.changed_by] ?? null) : null,
  }))

  return NextResponse.json(result)
}

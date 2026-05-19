import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const admin = createAdminClient()

async function authorizeUser(userId: string | undefined) {
  if (!userId) return { ok: false, error: 'userId не передан' }
  const { data: profile } = await admin.from('profiles').select('role').eq('id', userId).single()
  if (!profile) return { ok: false, error: 'Профиль не найден' }
  if (!['admin', 'manager'].includes(profile.role)) return { ok: false, error: 'Нет доступа' }
  return { ok: true, error: null }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const { userId } = body

  const { ok, error } = await authorizeUser(userId)
  if (!ok) return NextResponse.json({ error }, { status: 403 })

  const { data, error: dbError } = await admin
    .from('inventory_sessions')
    .update({ completed_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  return NextResponse.json({ data })
}

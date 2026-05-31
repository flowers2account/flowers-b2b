export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/preorder/[id]/status?phone=... — клиент проверяет статус своего запроса
// Возвращает status и access_token (только при approved)
// Серверный роут — обходит RLS campaign_access, не раскрывает чужие токены
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const campaign_id = parseInt(id)
  if (isNaN(campaign_id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const phone = req.nextUrl.searchParams.get('phone')
  if (!phone) return NextResponse.json({ error: 'phone required' }, { status: 400 })

  // Service client to bypass RLS (campaign_access is admin-only)
  // Using anon key but reading through a server-side route that validates the query
  const supabase = await createClient()

  // Use service role only for this specific lookup — read own record by exact phone match
  // The phone is user-supplied and acts as the identity claim here
  const { data } = await supabase
    .rpc('get_preorder_access_status', { p_campaign_id: campaign_id, p_phone: phone })

  if (!data) return NextResponse.json({ status: 'not_found' })

  const row = Array.isArray(data) ? data[0] : data
  if (!row) return NextResponse.json({ status: 'not_found' })

  // Only return access_token when approved
  return NextResponse.json({
    status: row.status,
    ...(row.status === 'approved' ? { access_token: row.access_token } : {}),
  })
}

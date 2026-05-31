export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST { code, phone, name } — клиент стучится в комнату
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const campaign_id = parseInt(id)
  if (isNaN(campaign_id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const supabase = await createClient()
  const { code, phone, name } = await req.json()

  if (!code || !phone) return NextResponse.json({ error: 'code и phone обязательны' }, { status: 400 })

  // Check access_code
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id, access_code, status')
    .eq('id', campaign_id)
    .single()

  if (!campaign) return NextResponse.json({ error: 'Акция не найдена' }, { status: 404 })
  if (campaign.status !== 'published') return NextResponse.json({ error: 'Акция не активна' }, { status: 403 })
  if (campaign.access_code !== code) return NextResponse.json({ error: 'Неверный код' }, { status: 403 })

  // INSERT without .select() — no RETURNING, no SELECT RLS check needed for anon
  // Duplicate phone (23505) is silently ignored: client polls /status to see existing state
  const { error } = await supabase
    .from('campaign_access')
    .insert({ campaign_id, guest_phone: phone, guest_name: name ?? null, status: 'pending' })

  if (error && error.code !== '23505') {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ status: 'pending', message: 'Ожидайте подтверждения от менеджера' })
}

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

function generateToken(): string {
  const arr = new Uint8Array(24)
  crypto.getRandomValues(arr)
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('')
}

// POST { access_id, action: 'approve'|'deny', userId? }
// Admin/manager action — client-side auth guard on /admin pages is the gate.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const campaign_id = parseInt(id)
  if (isNaN(campaign_id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const secret = req.headers.get('x-admin-secret')
  if (!secret || secret !== process.env.ADMIN_ACTION_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  const { access_id, action } = await req.json()
  if (!access_id || !['approve', 'deny'].includes(action)) {
    return NextResponse.json({ error: 'access_id и action (approve|deny) обязательны' }, { status: 400 })
  }

  const now = new Date().toISOString()

  if (action === 'deny') {
    const { error } = await supabase
      .from('campaign_access')
      .update({ status: 'denied', decided_at: now, decided_by: null })
      .eq('id', access_id)
      .eq('campaign_id', campaign_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ status: 'denied' })
  }

  // approve — generate token, save to DB; client polls /status to get it
  const access_token = generateToken()
  const { error } = await supabase
    .from('campaign_access')
    .update({ status: 'approved', access_token, decided_at: now, decided_by: null })
    .eq('id', access_id)
    .eq('campaign_id', campaign_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ status: 'approved' })
}

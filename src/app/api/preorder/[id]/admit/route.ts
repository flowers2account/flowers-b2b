export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

function generateToken(): string {
  const arr = new Uint8Array(24)
  crypto.getRandomValues(arr)
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('')
}

// POST { access_id, action: 'approve'|'deny' } — менеджер впускает/отклоняет
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const campaign_id = parseInt(id)
  if (isNaN(campaign_id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['admin', 'manager'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { access_id, action } = await req.json()
  if (!access_id || !['approve', 'deny'].includes(action)) {
    return NextResponse.json({ error: 'access_id и action (approve|deny) обязательны' }, { status: 400 })
  }

  const now = new Date().toISOString()

  if (action === 'deny') {
    await supabase
      .from('campaign_access')
      .update({ status: 'denied', decided_at: now, decided_by: user.id })
      .eq('id', access_id)
      .eq('campaign_id', campaign_id)

    return NextResponse.json({ status: 'denied' })
  }

  // approve — generate token
  const access_token = generateToken()
  const { error } = await supabase
    .from('campaign_access')
    .update({ status: 'approved', access_token, decided_at: now, decided_by: user.id })
    .eq('id', access_id)
    .eq('campaign_id', campaign_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ status: 'approved', access_token })
}

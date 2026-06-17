import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'client_notifications_enabled')
    .single()
  return NextResponse.json({ enabled: data?.value !== 'false' })
}

export async function POST(req: Request) {
  const supabase = createAdminClient()
  const { enabled } = await req.json()
  await supabase
    .from('app_settings')
    .upsert({ key: 'client_notifications_enabled', value: String(enabled), updated_at: new Date().toISOString() })
  return NextResponse.json({ enabled })
}

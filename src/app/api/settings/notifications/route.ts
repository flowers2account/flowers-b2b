import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'client_notifications_enabled')
    .single()
  return NextResponse.json({ enabled: data?.value !== 'false' })
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { enabled } = await req.json()
  await supabase
    .from('app_settings')
    .upsert({ key: 'client_notifications_enabled', value: String(enabled), updated_at: new Date().toISOString() })
  return NextResponse.json({ enabled })
}

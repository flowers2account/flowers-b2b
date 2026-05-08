import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { id } = await params
  const { data } = await supabase
    .from('order_history')
    .select('*')
    .eq('order_id', Number(id))
    .order('created_at', { ascending: true })
  return NextResponse.json(data ?? [])
}

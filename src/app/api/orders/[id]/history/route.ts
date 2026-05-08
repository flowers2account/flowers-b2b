import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('order_history')
    .select('*')
    .eq('order_id', Number(params.id))
    .order('created_at', { ascending: true })
  return NextResponse.json(data ?? [])
}

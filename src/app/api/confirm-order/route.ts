import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = await createClient()

  const { order_id } = await req.json()

  await supabase.from('orders').update({ status: 'confirmed' }).eq('id', order_id)
  const { error } = await supabase.rpc('confirm_order_fifo', { p_order_id: order_id })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

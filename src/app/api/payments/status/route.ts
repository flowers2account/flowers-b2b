import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const invoice = req.nextUrl.searchParams.get('invoice')
  if (!invoice) return NextResponse.json({ error: 'invoice required' }, { status: 400 })

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('payments')
    .select('status, order_id, card_mask, amount')
    .eq('invoice_id', invoice)
    .maybeSingle()

  if (error || !data) return NextResponse.json({ error: 'not found' }, { status: 404 })

  return NextResponse.json({
    status: data.status,
    orderId: data.order_id,
    cardMask: data.card_mask,
    amount: data.amount,
  })
}

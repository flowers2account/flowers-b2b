import { NextRequest, NextResponse } from 'next/server'
import { applyOrderStatus } from '@/lib/order-status'

export const dynamic = 'force-dynamic'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const orderId = parseInt(id)

  const { status, changed_by, payment_method, payment_comment } = await req.json()
  if (!status) return NextResponse.json({ error: 'Missing status' }, { status: 400 })

  // Единая логика смены статуса (списание/история/WhatsApp/синк в amo) — общая с вебхуком.
  const res = await applyOrderStatus(orderId, status, {
    changedBy: changed_by ?? null,
    paymentMethod: payment_method,
    paymentComment: payment_comment,
  })
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.httpStatus })
  return NextResponse.json({ success: true })
}

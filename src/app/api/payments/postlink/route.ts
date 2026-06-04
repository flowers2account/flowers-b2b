import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// Postlink — публичный, источник истины для статуса оплаты
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    console.log('[payments/postlink] received:', JSON.stringify(body).slice(0, 500))

    const invoiceId = body.invoiceId ?? body.invoice_id ?? body.id
    if (!invoiceId) return NextResponse.json({ error: 'invoiceId missing' }, { status: 400 })

    const supabase = createAdminClient()

    // Find payment record
    const { data: payment, error: pErr } = await supabase
      .from('payments')
      .select('*')
      .eq('invoice_id', String(invoiceId))
      .maybeSingle()

    if (pErr || !payment) {
      console.error('[payments/postlink] not found:', invoiceId)
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
    }

    // Idempotency: already success → return 200
    if (payment.status === 'success') {
      return NextResponse.json({ ok: true, idempotent: true })
    }

    // Verify amount
    const bodyAmount = Number(body.amount ?? body.sum ?? 0)
    if (bodyAmount && bodyAmount !== Number(payment.amount)) {
      console.error(`[payments/postlink] amount mismatch: expected ${payment.amount}, got ${bodyAmount}`)
      return NextResponse.json({ error: 'amount mismatch' }, { status: 400 })
    }

    // Verify terminal if present
    const bodyTerminal = body.terminal ?? body.merchantId
    if (bodyTerminal && bodyTerminal !== process.env.EPAY_TERMINAL_ID) {
      console.error('[payments/postlink] terminal mismatch:', bodyTerminal)
      return NextResponse.json({ error: 'terminal mismatch' }, { status: 400 })
    }

    // Verify secret_hash if present in payload
    if (body.secret_hash && body.secret_hash !== payment.secret_hash) {
      console.error('[payments/postlink] secret_hash mismatch')
      return NextResponse.json({ error: 'secret_hash mismatch' }, { status: 400 })
    }

    const code = (body.code ?? body.status ?? '').toString().toLowerCase()
    const isSuccess = code === 'ok' || code === 'success' || code === '0'

    const paymentNested = body.payment ?? body.data ?? {}
    const epayPaymentId = paymentNested.id ?? body.paymentId ?? null
    const cardMask = paymentNested.cardMask ?? body.cardMask ?? null
    const reference = paymentNested.referenceId ?? body.reference ?? null
    const now = new Date().toISOString()

    if (isSuccess) {
      // Update payments → success
      await supabase.from('payments').update({
        status: 'success',
        paid_at: now,
        epay_payment_id: epayPaymentId,
        card_mask: cardMask,
        reference,
        raw_postlink: body,
      }).eq('id', payment.id)

      // Update order → paid
      await supabase.from('orders').update({
        payment_status: 'paid',
        paid_at: now,
        payment_method: 'epay',
        payment_comment: cardMask ? `Карта ${cardMask}` : 'epay',
      }).eq('id', payment.order_id)

      // Manager notification via Telegram
      const amount = Number(payment.amount).toLocaleString('ru-RU')
      const tgText = `💳 Заказ №${payment.order_id} ОПЛАЧЕН${cardMask ? ` картой ${cardMask}` : ''}\nСумма: ${amount} ₸\nInvoice: ${invoiceId}`
      fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text: tgText }),
      }).catch(e => console.error('Telegram notify failed:', e))

    } else {
      // Failed payment
      const reason = body.reason ?? body.message ?? body.error ?? code
      await supabase.from('payments').update({
        status: 'failed',
        reason: String(reason).slice(0, 500),
        raw_postlink: body,
      }).eq('id', payment.id)
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[payments/postlink]', err)
    // Always 200 on correct processing per spec
    return NextResponse.json({ ok: true, warning: 'internal error logged' })
  }
}

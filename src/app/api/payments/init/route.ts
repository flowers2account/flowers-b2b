import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { epayServerConfig } from '@/lib/epay-server'
import { randomBytes } from 'crypto'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { orderId } = await req.json()
    if (!orderId) return NextResponse.json({ error: 'orderId required' }, { status: 400 })

    const supabase = createAdminClient()

    // Validate order
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('id, total, status, payment_status, client_id, guest_phone')
      .eq('id', orderId)
      .single()

    if (orderErr || !order) return NextResponse.json({ error: 'Заказ не найден' }, { status: 404 })

    const payableStatuses = ['pending', 'reserved', 'confirmed']
    if (!payableStatuses.includes(order.status) || order.payment_status !== 'unpaid') {
      return NextResponse.json({ error: 'Заказ не может быть оплачен' }, { status: 409 })
    }

    // Fetch client phone for accountId
    let accountId = order.guest_phone ?? String(orderId)
    if (order.client_id) {
      const { data: client } = await supabase
        .from('clients')
        .select('phone')
        .eq('id', order.client_id)
        .maybeSingle()
      if (client?.phone) accountId = client.phone
    }

    // New invoice_id from sequence + secret_hash
    // Get next invoice_id from sequence — строго цифры, 6-15 знаков (требование epay)
    let invoiceId: string
    try {
      const { data: seqRow } = await supabase.rpc('get_next_invoice_id').single()
      invoiceId = seqRow ? String(seqRow) : String(Date.now()).slice(-12)
    } catch {
      invoiceId = String(Date.now()).slice(-12)
    }

    const secretHash = randomBytes(12).toString('hex') // 24 hex chars

    const amount = Math.round(Number(order.total)) // целые тенге
    const currency = 'KZT'
    const epay = epayServerConfig()        // creds + OAuth-URL по флагу EPAY_ENV (test|prod)
    const terminal = epay.terminal

    // OAuth token from epay
    const oauthParams = new URLSearchParams({
      grant_type: 'client_credentials',
      scope: 'webapi usermanagement email_send verification statement statistics payment',
      client_id: epay.clientId,
      client_secret: epay.clientSecret,
      invoiceID: invoiceId,
      amount: String(amount),
      currency,
      terminal,
    })

    const oauthRes = await fetch(epay.oauthUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: oauthParams.toString(),
    })

    if (!oauthRes.ok) {
      const errText = await oauthRes.text().catch(() => '')
      // Save failed payment record
      await supabase.from('payments').insert({
        order_id: orderId, invoice_id: invoiceId, amount, currency,
        status: 'failed', secret_hash: secretHash,
        reason: `OAuth error ${oauthRes.status}: ${errText.slice(0, 300)}`,
      })
      return NextResponse.json({ error: 'Ошибка получения токена банка' }, { status: 502 })
    }

    const authObj = await oauthRes.json()

    // Save payment record
    await supabase.from('payments').insert({
      order_id: orderId, invoice_id: invoiceId, amount, currency,
      status: 'created', secret_hash: secretHash,
    })

    // Build origin from request
    const origin = req.headers.get('origin') ?? req.nextUrl.origin

    return NextResponse.json({
      auth: authObj,
      invoiceId,
      amount,
      currency,
      terminal,
      language: 'RUS',
      description: `Оплата заказа №${orderId}`,
      accountId,
      backLink: `${origin}/payment/success?invoice=${invoiceId}`,
      failureBackLink: `${origin}/payment/fail?invoice=${invoiceId}`,
      postLink: `${origin}/api/payments/postlink`,
      failurePostLink: `${origin}/api/payments/postlink`,
    })
  } catch (err) {
    console.error('[payments/init]', err)
    return NextResponse.json({ error: 'Внутренняя ошибка' }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthedWithRole } from '@/lib/api-auth'
import { fetchEpayOperations, type EpayOperation } from '@/lib/epay-operations'

/**
 * Синхронизация реестра банка ePay → payment_operations. READ-ONLY для банка
 * (только POST /operations). Идемпотентно: upsert ON CONFLICT (epay_operation_id).
 * payments НЕ трогаем. order_id проставляется через payments по invoice_id.
 *
 * Body: { from?: 'YYYY-MM-DD', to?: 'YYYY-MM-DD' } — по умолчанию последние 30 дней.
 */

const OFFSET = '+05:00' // Asia/Oral
const PAGE_SIZE = 100
const MAX_PAGES = 100 // страховка от бесконечного цикла

const str = (v: unknown): string | null => {
  const t = v == null ? '' : String(v).trim()
  return t ? t : null
}
const num = (v: unknown): number | null => {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export async function POST(req: NextRequest) {
  const authed = await getAuthedWithRole(req, ['admin', 'manager'])
  if (!authed) return NextResponse.json({ error: 'Доступ запрещён' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const today = new Date()
  const d30 = new Date(today.getTime() - 30 * 86_400_000)
  const ymd = (d: Date) => d.toISOString().slice(0, 10)
  const from = (body.from as string) || ymd(d30)
  const to = (body.to as string) || ymd(today)
  const fromIso = `${from}T00:00:00${OFFSET}`
  const toIso = `${to}T23:59:59${OFFSET}`

  // 1) Тянем все страницы реестра за период
  const records: EpayOperation[] = []
  let totalCount = 0
  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const { totalCount: tc, records: batch } = await fetchEpayOperations({
        fromIso, toIso, page, size: PAGE_SIZE,
      })
      totalCount = tc
      records.push(...batch)
      if (batch.length < PAGE_SIZE || records.length >= tc) break
    }
  } catch (err) {
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 502 })
  }

  const supabase = createAdminClient()

  // 2) Маппинг invoice_id → order_id из payments (для проставления order_id)
  const invoiceIds = [...new Set(records.map(r => str(r.invoiceId)).filter((v): v is string => !!v))]
  const invoiceToOrder = new Map<string, number>()
  if (invoiceIds.length > 0) {
    const { data: pays } = await supabase
      .from('payments')
      .select('invoice_id, order_id')
      .in('invoice_id', invoiceIds)
    for (const p of pays ?? []) {
      if (p.invoice_id && p.order_id != null) invoiceToOrder.set(String(p.invoice_id), p.order_id as number)
    }
  }

  // 3) Сборка строк для upsert
  const rows = records
    .filter(r => str(r.id)) // без id банка строку не дедупнуть
    .map(r => {
      const invoice = str(r.invoiceId)
      return {
        epay_operation_id: String(r.id),
        invoice_id: invoice,
        order_id: invoice ? invoiceToOrder.get(invoice) ?? null : null,
        status: str(r.status),
        amount: num(r.amount),
        org_amount: num(r.orgAmount),
        currency: str(r.currency),
        reference: str(r.reference),
        card_mask: str(r.cardMask),
        card_type: str(r.cardType),
        issuer: str(r.issuer),
        approval_code: str(r.approvalCode),
        payer_name: str(r.payerName),
        payer_phone: str(r.payerPhone),
        payer_email: str(r.payerEmail),
        created_date: str(r.createdDate),
        payout_date: str(r.payoutDate),
        payout_amount: num(r.payoutAmount),
        source: 'registry',
        raw: r,
        synced_at: new Date().toISOString(),
      }
    })

  // 4) Идемпотентный upsert по банковскому id операции
  let upserted = 0
  if (rows.length > 0) {
    const { error, count } = await supabase
      .from('payment_operations')
      .upsert(rows, { onConflict: 'epay_operation_id', count: 'exact' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    upserted = count ?? rows.length
  }

  const matched = rows.filter(r => r.order_id != null).length
  const registryOnly = rows.filter(r => r.order_id == null).length

  return NextResponse.json({
    ok: true,
    period: { from, to },
    totalCount,
    fetched: records.length,
    upserted,
    matched,        // привязаны к заказу сайта
    registryOnly,   // операции мимо сайта (order_id NULL)
  })
}

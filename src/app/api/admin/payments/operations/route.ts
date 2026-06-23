export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthedWithRole } from '@/lib/api-auth'

/**
 * Реестр банка (payment_operations) для вкладки «Реестр банка» на /admin/payments.
 * READ-ONLY. Фильтры: тип операции (status), период (по created_date), поиск.
 * Джойн orders по order_id (клиент, amo_lead_id). Сводка: Σ CHARGE / Σ REFUND.
 */

type OrderEmbed = {
  id: number
  status: string | null
  guest_name: string | null
  guest_phone: string | null
  amo_lead_id: number | null
  client: { name: string | null; phone: string | null; company_name: string | null } | null
} | null

type Row = {
  id: string
  epay_operation_id: string
  invoice_id: string | null
  order_id: number | null
  status: string | null
  amount: number | null
  org_amount: number | null
  currency: string | null
  reference: string | null
  card_mask: string | null
  card_type: string | null
  issuer: string | null
  approval_code: string | null
  payer_name: string | null
  payer_phone: string | null
  payer_email: string | null
  created_date: string | null
  payout_date: string | null
  payout_amount: number | null
  source: string | null
  synced_at: string | null
  raw: unknown
  order: OrderEmbed
}

const OFFSET = '+05:00' // Asia/Oral

export async function GET(req: NextRequest) {
  const authed = await getAuthedWithRole(req, ['admin', 'manager'])
  if (!authed) return NextResponse.json({ error: 'Доступ запрещён' }, { status: 403 })

  const sp = req.nextUrl.searchParams
  const status = (sp.get('status') ?? '').trim()
  const from = (sp.get('from') ?? '').trim()
  const to = (sp.get('to') ?? '').trim()
  const q = (sp.get('q') ?? '').trim().toLowerCase()
  const page = Math.max(0, parseInt(sp.get('page') ?? '0', 10) || 0)
  const pageSize = Math.min(200, Math.max(1, parseInt(sp.get('pageSize') ?? '50', 10) || 50))

  const supabase = createAdminClient()

  const all: Row[] = []
  for (let offset = 0; ; offset += 1000) {
    let query = supabase
      .from('payment_operations')
      .select(`
        id, epay_operation_id, invoice_id, order_id, status, amount, org_amount, currency,
        reference, card_mask, card_type, issuer, approval_code,
        payer_name, payer_phone, payer_email, created_date, payout_date, payout_amount,
        source, synced_at, raw,
        order:order_id ( id, status, guest_name, guest_phone, amo_lead_id,
          client:client_id ( name, phone, company_name ) )
      `)
      .order('created_date', { ascending: false, nullsFirst: false })
      .range(offset, offset + 999)

    if (from) query = query.gte('created_date', `${from}T00:00:00${OFFSET}`)
    if (to) query = query.lte('created_date', `${to}T23:59:59${OFFSET}`)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const batch = (data ?? []) as unknown as Row[]
    all.push(...batch)
    if (batch.length < 1000) break
  }

  const matchQ = (r: Row): boolean => {
    if (!q) return true
    const o = r.order
    const hay = [
      r.invoice_id,
      r.order_id != null ? String(r.order_id) : '',
      r.reference,
      r.card_mask,
      r.payer_name,
      r.payer_phone,
      o?.client?.name,
      o?.client?.company_name,
      o?.guest_name,
    ].filter(Boolean).join(' ').toLowerCase()
    return hay.includes(q)
  }

  const periodSet = all.filter(matchQ)

  // Сводка по периоду+q (не зависит от фильтра типа)
  const sumBy = (s: string) =>
    periodSet.filter(r => r.status === s).reduce((acc, r) => acc + Number(r.amount || 0), 0)
  const summary = {
    chargeSum: sumBy('CHARGE'),
    refundSum: sumBy('REFUND'),
    chargeCount: periodSet.filter(r => r.status === 'CHARGE').length,
    refundCount: periodSet.filter(r => r.status === 'REFUND').length,
    registryOnlyCount: periodSet.filter(r => r.order_id == null).length,
  }

  const filtered = status ? periodSet.filter(r => r.status === status) : periodSet
  const total = filtered.length
  const rows = filtered.slice(page * pageSize, page * pageSize + pageSize)

  return NextResponse.json({ rows, total, page, pageSize, summary })
}

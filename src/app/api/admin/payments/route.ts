export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthedWithRole } from '@/lib/api-auth'

/**
 * Экран «Платежи» (/admin/payments) — READ-ONLY. Источник: таблица payments
 * (оплаты с сайта, epay postlink). Никаких charge/refund/cancel.
 *
 * Параметры:
 *   status   — '' | success | failed | created (фильтр строк таблицы)
 *   from,to  — YYYY-MM-DD (включительно, по дате создания, таймзона Asia/Oral +05:00)
 *   q        — поиск: № заказа / invoice_id / имя / телефон / карта
 *   page     — 0-based, pageSize — размер страницы (по умолчанию 50)
 *
 * Сводка (summary) считается по period+q БЕЗ учёта status-фильтра и ТОЛЬКО по success.
 */

type OrderEmbed = {
  id: number
  status: string | null
  client_id: string | null
  guest_name: string | null
  guest_phone: string | null
  amo_lead_id: number | null
  client: { name: string | null; phone: string | null; company_name: string | null } | null
} | null

type Row = {
  id: string
  invoice_id: string
  order_id: number | null
  amount: number
  currency: string | null
  status: string | null
  card_mask: string | null
  card_type: string | null
  approval_code: string | null
  reference: string | null
  issuer: string | null
  reason: string | null
  reason_code: number | null
  payer_name: string | null
  payer_phone: string | null
  payer_email: string | null
  bank_datetime: string | null
  created_at: string
  paid_at: string | null
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

  // Тянем платежи за период (фильтр статуса/поиск — в памяти, объём небольшой).
  const all: Row[] = []
  for (let offset = 0; ; offset += 1000) {
    let query = supabase
      .from('payments')
      .select(`
        id, invoice_id, order_id, amount, currency, status, card_mask, card_type,
        approval_code, reference, issuer, reason, reason_code,
        payer_name, payer_phone, payer_email, bank_datetime, created_at, paid_at,
        order:order_id ( id, status, client_id, guest_name, guest_phone, amo_lead_id,
          client:client_id ( name, phone, company_name ) )
      `)
      .order('created_at', { ascending: false })
      .range(offset, offset + 999)

    if (from) query = query.gte('created_at', `${from}T00:00:00${OFFSET}`)
    if (to) query = query.lte('created_at', `${to}T23:59:59${OFFSET}`)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const batch = (data ?? []) as unknown as Row[]
    all.push(...batch)
    if (batch.length < 1000) break
  }

  // Поиск q — по периоду (до status-фильтра и до сводки)
  const matchQ = (r: Row): boolean => {
    if (!q) return true
    const o = r.order
    const hay = [
      r.invoice_id,
      r.order_id != null ? String(r.order_id) : '',
      r.card_mask,
      r.payer_name,
      r.payer_phone,
      o?.client?.name,
      o?.client?.company_name,
      o?.client?.phone,
      o?.guest_name,
      o?.guest_phone,
    ].filter(Boolean).join(' ').toLowerCase()
    return hay.includes(q)
  }

  const periodSet = all.filter(matchQ)

  // ── Сводка: только success за период+q (status-фильтр НЕ влияет) ──
  const success = periodSet.filter(r => r.status === 'success')
  const accepted = success.reduce((s, r) => s + Number(r.amount || 0), 0)
  const summary = {
    accepted,
    successCount: success.length,
    failedCount: periodSet.filter(r => r.status === 'failed').length,
    createdCount: periodSet.filter(r => r.status === 'created').length,
    avgCheck: success.length ? Math.round(accepted / success.length) : 0,
  }

  // ── Таблица: применяем фильтр статуса + пагинация ──
  const filtered = status ? periodSet.filter(r => r.status === status) : periodSet
  const total = filtered.length
  const rows = filtered.slice(page * pageSize, page * pageSize + pageSize)

  return NextResponse.json({ rows, total, page, pageSize, summary })
}

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthedWithRole } from '@/lib/api-auth'

/**
 * Экран «Статистика» (/admin/stats) — READ-ONLY. Считает три блока за период:
 *   1) Воронка заказов: создано → оплачено → собрано(assembled+) → выдано(delivered)
 *   2) Оплаты: success / failed / created (кол-во + суммы), % успешных, failed rate
 *   3) Топ-10 товаров (по числу заказов) и топ-10 клиентов (по сумме заказов)
 *
 * Параметры:
 *   from,to — YYYY-MM-DD (включительно, по дате создания, таймзона Asia/Oral +05:00)
 *
 * ⚠️ Тестовые заказы в базе НЕ фильтруются (по требованию) — почистятся отдельно.
 */

const OFFSET = '+05:00' // Asia/Oral

type OrderRow = {
  id: number
  status: string | null
  payment_status: string | null
  total: number | null
  created_at: string
  client_id: string | null
  guest_name: string | null
  guest_phone: string | null
  client: { name: string | null; phone: string | null; company_name: string | null } | null
}

type PaymentRow = { status: string | null; amount: number | null }

type ItemRow = {
  order_id: number
  qty: number | null
  product: { name: string | null } | null
}

// дефолт — последние 7 дней (включая сегодня), если from/to не переданы
function defaultRange(): { from: string; to: string } {
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
  const now = new Date()
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const from = new Date(to.getTime() - 6 * 86_400_000)
  return { from: fmt(from), to: fmt(to) }
}

export async function GET(req: NextRequest) {
  const authed = await getAuthedWithRole(req, ['admin', 'manager'])
  if (!authed) return NextResponse.json({ error: 'Доступ запрещён' }, { status: 403 })

  const sp = req.nextUrl.searchParams
  const def = defaultRange()
  const from = (sp.get('from') || def.from).trim()
  const to = (sp.get('to') || def.to).trim()

  const gte = `${from}T00:00:00${OFFSET}`
  const lte = `${to}T23:59:59${OFFSET}`

  const supabase = createAdminClient()

  // ── 1. Заказы за период (для воронки + топ-клиентов) ──
  const orders: OrderRow[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from('orders')
      .select(`
        id, status, payment_status, total, created_at, client_id, guest_name, guest_phone,
        client:client_id ( name, phone, company_name )
      `)
      .gte('created_at', gte)
      .lte('created_at', lte)
      .order('created_at', { ascending: false })
      .range(offset, offset + 999)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const batch = (data ?? []) as unknown as OrderRow[]
    orders.push(...batch)
    if (batch.length < 1000) break
  }

  // ── Воронка ──
  const created = orders.length
  const paid = orders.filter(o => o.payment_status === 'paid').length
  const assembled = orders.filter(o => o.status === 'assembled' || o.status === 'delivered').length
  const delivered = orders.filter(o => o.status === 'delivered').length
  const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0)
  const funnel = {
    created,
    paid,
    assembled,
    delivered,
    // % перехода относительно предыдущего этапа
    paidPct: pct(paid, created),
    assembledPct: pct(assembled, paid),
    deliveredPct: pct(delivered, assembled),
  }

  // ── 2. Оплаты за период ──
  const payments: PaymentRow[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from('payments')
      .select('status, amount')
      .gte('created_at', gte)
      .lte('created_at', lte)
      .range(offset, offset + 999)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const batch = (data ?? []) as unknown as PaymentRow[]
    payments.push(...batch)
    if (batch.length < 1000) break
  }

  const sumBy = (s: string) =>
    payments.filter(p => p.status === s).reduce((acc, p) => acc + Number(p.amount || 0), 0)
  const cntBy = (s: string) => payments.filter(p => p.status === s).length
  const totalAttempts = payments.length
  const successCount = cntBy('success')
  const failedCount = cntBy('failed')
  const paymentsBlock = {
    totalAttempts,
    successCount,
    failedCount,
    createdCount: cntBy('created'),
    successSum: sumBy('success'),
    failedSum: sumBy('failed'),
    createdSum: sumBy('created'),
    // % успешных = success / все попытки; failed rate — ключевая метрика
    successRate: pct(successCount, totalAttempts),
    failedRate: pct(failedCount, totalAttempts),
  }

  // ── 3a. Топ-10 товаров (по числу заказов, в которых встречается товар) ──
  const orderIds = orders.map(o => o.id)
  const prodOrders = new Map<string, { name: string; orders: Set<number>; qty: number }>()
  if (orderIds.length) {
    for (let i = 0; i < orderIds.length; i += 500) {
      const chunk = orderIds.slice(i, i + 500)
      const { data, error } = await supabase
        .from('order_items')
        .select('order_id, qty, product:product_id ( name )')
        .in('order_id', chunk)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      for (const it of (data ?? []) as unknown as ItemRow[]) {
        const name = it.product?.name?.trim() || '(без названия)'
        const e = prodOrders.get(name) ?? { name, orders: new Set<number>(), qty: 0 }
        e.orders.add(it.order_id)
        e.qty += Number(it.qty || 0)
        prodOrders.set(name, e)
      }
    }
  }
  const topProducts = [...prodOrders.values()]
    .map(e => ({ name: e.name, orders: e.orders.size, qty: e.qty }))
    .sort((a, b) => b.orders - a.orders || b.qty - a.qty)
    .slice(0, 10)

  // ── 3b. Топ-10 клиентов (по сумме заказов) ──
  const clientAgg = new Map<string, { label: string; phone: string | null; total: number; count: number }>()
  for (const o of orders) {
    const name = o.client?.name ?? o.guest_name ?? null
    const company = o.client?.company_name ?? null
    const phone = o.client?.phone ?? o.guest_phone ?? null
    const label = (company && name ? `${company} / ${name}` : company || name || phone || 'Гость')
    const key = o.client_id ? `c:${o.client_id}` : `g:${phone || name || o.id}`
    const e = clientAgg.get(key) ?? { label, phone, total: 0, count: 0 }
    e.total += Number(o.total || 0)
    e.count += 1
    clientAgg.set(key, e)
  }
  const topClients = [...clientAgg.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)

  return NextResponse.json({
    range: { from, to },
    funnel,
    payments: paymentsBlock,
    topProducts,
    topClients,
  })
}

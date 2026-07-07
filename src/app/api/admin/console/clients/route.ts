import { NextRequest, NextResponse } from 'next/server'
import { getAuthedWithRole, sessionClient } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

// Список зарегистрированных клиентов для пульта оператора. Доступ — admin/manager
// (по Bearer-токену). Чтение сессионным клиентом: RLS-политика
// `clients: admin reads all` (is_admin_or_manager()) отдаёт все строки.
// ⚠️ Колонка `pin` — чувствительная, НИКОГДА не выбирается и не уходит на клиент.
export async function GET(req: NextRequest) {
  const authed = await getAuthedWithRole(req, ['admin', 'manager'])
  if (!authed) return NextResponse.json({ error: 'Доступ запрещён' }, { status: 403 })

  const sb = sessionClient(req)

  const { data: clients, error } = await sb
    .from('clients')
    .select('id, name, company_name, bin, phone, city, credit_limit, status, created_at')
    .order('created_at', { ascending: false })
    .limit(2000)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Агрегат по заказам (кол-во + сумма) на клиента. Корзины (status='cart') и
  // гостевые заказы (client_id=null) в счёт не идут.
  const agg: Record<string, { count: number; sum: number }> = {}
  const { data: orders } = await sb
    .from('orders')
    .select('client_id, total, status')
    .neq('status', 'cart')
    .limit(5000)
  for (const o of orders ?? []) {
    if (!o.client_id) continue
    const a = (agg[o.client_id] ||= { count: 0, sum: 0 })
    a.count += 1
    a.sum += Number(o.total) || 0
  }

  const result = (clients ?? []).map((c: any) => ({
    ...c,
    order_count: agg[c.id]?.count ?? 0,
    order_sum: agg[c.id]?.sum ?? 0,
  }))

  return NextResponse.json({ clients: result })
}

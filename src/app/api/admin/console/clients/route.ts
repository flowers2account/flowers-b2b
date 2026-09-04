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

  // Текущая корзина клиента (status='cart', notes='[customer_cart]'): сумма товаров,
  // число позиций и когда последний раз менялась — чтобы менеджер видел «набрал, но не
  // оформил» прямо в списке, без открытия панели.
  const cartAgg: Record<string, { sum: number; count: number; updated_at: string | null }> = {}
  const { data: carts } = await sb
    .from('orders')
    .select('client_id, updated_at, order_items(qty, price, is_removed)')
    .eq('status', 'cart')
    .eq('notes', '[customer_cart]')
    .limit(5000)
  for (const c of carts ?? []) {
    if (!c.client_id) continue
    const items = (c.order_items ?? []) as { qty: number; price: number; is_removed: boolean }[]
    let sum = 0, count = 0
    for (const it of items) {
      if (it.is_removed) continue
      sum += (Number(it.qty) || 0) * (Number(it.price) || 0)
      count += 1
    }
    const prev = cartAgg[c.client_id]
    // на клиента обычно одна корзина; если вдруг несколько — берём самую свежую непустую
    if (!prev || (count > 0 && (c.updated_at ?? '') > (prev.updated_at ?? ''))) {
      cartAgg[c.client_id] = { sum, count, updated_at: c.updated_at ?? null }
    }
  }

  const result = (clients ?? []).map((c: any) => ({
    ...c,
    order_count: agg[c.id]?.count ?? 0,
    order_sum: agg[c.id]?.sum ?? 0,
    cart_sum: cartAgg[c.id]?.sum ?? 0,
    cart_count: cartAgg[c.id]?.count ?? 0,
    cart_updated_at: cartAgg[c.id]?.updated_at ?? null,
  }))

  return NextResponse.json({ clients: result })
}

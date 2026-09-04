import { NextRequest, NextResponse } from 'next/server'
import { getAuthedWithRole, sessionClient } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

// Карточка клиента для пульта оператора: полная запись клиента (без `pin`) +
// его заказы (кратко). Доступ — admin/manager. Читаем сессионным клиентом (RLS
// `is_admin_or_manager()` отдаёт все строки).
export async function GET(req: NextRequest) {
  const authed = await getAuthedWithRole(req, ['admin', 'manager'])
  if (!authed) return NextResponse.json({ error: 'Доступ запрещён' }, { status: 403 })

  const clientId = req.nextUrl.searchParams.get('client_id')?.trim()
  if (!clientId) return NextResponse.json({ error: 'client_id обязателен' }, { status: 400 })

  const sb = sessionClient(req)

  const { data: client, error } = await sb
    .from('clients')
    .select('id, name, company_name, bin, phone, city, address, credit_limit, status, created_at, amo_contact_id, auth_user_id')
    .eq('id', clientId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!client) return NextResponse.json({ error: 'Клиент не найден' }, { status: 404 })

  const { data: orders } = await sb
    .from('orders')
    .select('id, status, total, payment_status, created_at, notes, order_items(id)')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(100)

  const list = (orders ?? []).map((o: { id: number; status: string; total: number | null; payment_status: string | null; created_at: string; notes: string | null; order_items: unknown[] | null }) => ({
    id: o.id,
    status: o.status,
    total: o.total,
    payment_status: o.payment_status,
    created_at: o.created_at,
    is_cart: o.notes === '[customer_cart]',
    item_count: Array.isArray(o.order_items) ? o.order_items.length : 0,
  }))

  return NextResponse.json({ client, orders: list })
}

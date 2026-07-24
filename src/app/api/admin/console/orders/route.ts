import { NextRequest, NextResponse } from 'next/server'
import { getAuthedWithRole, sessionClient } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

// Лента заказов для пульта оператора. Доступ — admin/manager (по Bearer-токену).
// Чтение идёт сессионным клиентом: RLS-политика `orders: admin all` отдаёт всё.
export async function GET(req: NextRequest) {
  const authed = await getAuthedWithRole(req, ['admin', 'manager'])
  if (!authed) return NextResponse.json({ error: 'Доступ запрещён' }, { status: 403 })

  const sb = sessionClient(req)

  const { data: orders, error } = await sb
    .from('orders')
    .select(`
      id, status, total, payment_status, payment_method, payment_comment, paid_at,
      fulfillment_type, delivery_city, delivery_address, delivery_date,
      recipient_name, recipient_phone, driver_name, driver_phone, driver_car_plate,
      delivery_cost, courier_comment, notes, assembly_photo_url, created_at,
      guest_name, guest_phone, client_id,
      client:client_id ( id, name, company_name, bin, phone, city, address ),
      items:order_items ( id, qty, qty_ordered, qty_actual, is_removed, price, color,
        product:product_id ( name, display_name, pack_size ) )
    `)
    .order('id', { ascending: false })
    .limit(1000)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const visibleOrders = (orders ?? []).filter((o: any) => o.notes !== '[customer_cart]')
  const ids = visibleOrders.map((o: any) => o.id)
  let history: any[] = []
  if (ids.length) {
    const { data: h } = await sb
      .from('order_history')
      .select('id, order_id, status_from, status_to, changed_by, note, created_at')
      .in('order_id', ids)
      .order('created_at', { ascending: true })
    history = h ?? []
  }

  // Имена операторов: changed_by → profiles.full_name (FK истории смотрит на auth.users)
  const actorIds = Array.from(new Set(history.map((h) => h.changed_by).filter(Boolean)))
  const names: Record<string, string> = {}
  if (actorIds.length) {
    const { data: profs } = await sb.from('profiles').select('id, full_name').in('id', actorIds)
    for (const p of profs ?? []) names[p.id] = p.full_name || ''
  }

  const histByOrder: Record<number, any[]> = {}
  for (const h of history) {
    ;(histByOrder[h.order_id] ||= []).push({ ...h, changed_by_name: names[h.changed_by] || null })
  }

  const result = visibleOrders.map((o: any) => {
    const hist = histByOrder[o.id] || []
    // «Оператор заказа» = кто перевёл его в работу (reserved); иначе последний менявший
    const took = [...hist].reverse().find((h) => h.status_to === 'reserved' && h.changed_by_name)
    const last = [...hist].reverse().find((h) => h.changed_by_name)
    return { ...o, history: hist, operator_name: (took || last)?.changed_by_name || null }
  })

  return NextResponse.json({ orders: result })
}

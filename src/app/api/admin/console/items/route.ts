import { NextRequest, NextResponse } from 'next/server'
import { getAuthedWithRole, sessionClient } from '@/lib/api-auth'
import { computeOrderTotal } from '@/lib/order-total'

export const dynamic = 'force-dynamic'

// Состав правим черновиком ТОЛЬКО до подтверждения: на этих статусах остаток
// (products.qty) ещё не списан (списание делает confirm_order_fifo на confirmed),
// а резервы — мягкие 30-минутные холды (сами истекают). Так инвариант остатка не ломается.
// После confirmed состав корректируется при сборке (qty_actual) — это вне этой задачи.
const EDITABLE = new Set(['cart', 'pending', 'reserved', 'negotiation'])

export async function POST(req: NextRequest) {
  const authed = await getAuthedWithRole(req, ['admin', 'manager'])
  if (!authed) return NextResponse.json({ error: 'Доступ запрещён' }, { status: 403 })

  const { order_id, items } = await req.json().catch(() => ({}))
  const id = Number(order_id)
  if (!id || !Array.isArray(items)) {
    return NextResponse.json({ error: 'order_id и items обязательны' }, { status: 400 })
  }

  const sb = sessionClient(req)

  const { data: order, error: oErr } = await sb
    .from('orders').select('id, status, total, fulfillment_type, delivery_city, delivery_cost, client_id').eq('id', id).maybeSingle()
  if (oErr) return NextResponse.json({ error: oErr.message }, { status: 500 })
  if (!order) return NextResponse.json({ error: 'Заказ не найден' }, { status: 404 })
  if (!EDITABLE.has(order.status)) {
    return NextResponse.json(
      { error: 'Состав можно менять только до подтверждения заказа' },
      { status: 409 },
    )
  }

  // Текущие позиции заказа (источник цены — сервер, не клиент)
  const { data: rows, error: iErr } = await sb
    .from('order_items').select('id, qty, price, is_removed').eq('order_id', id)
  if (iErr) return NextResponse.json({ error: iErr.message }, { status: 500 })

  const byId = new Map((rows ?? []).map((r: any) => [r.id, r]))

  // Применяем правки количества к существующим позициям заказа
  for (const it of items) {
    const row = byId.get(Number(it.id))
    if (!row) continue
    const qty = Math.max(0, Math.floor(Number(it.qty)))
    if (!Number.isFinite(qty) || qty === row.qty) continue
    const { error: uErr } = await sb
      .from('order_items').update({ qty }).eq('id', row.id).eq('order_id', id)
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 })
    row.qty = qty
  }

  // Первый заказ клиента — условие скидки 1% (см. order-total.ts), считаем по id <
  // текущего заказа, чтобы результат не зависел от заказов, созданных позже.
  const { count: priorOrdersCount } = await sb
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', order.client_id)
    .neq('status', 'cart')
    .lt('id', order.id)
  const isFirstOrder = (priorOrdersCount ?? 0) === 0

  // Пересчёт суммы НА СЕРВЕРЕ единым хелпером (общий с чекаутом): goods − скидка 1%
  // Уральска (только первый заказ) + доставка. Скидка/доставка берутся из самого заказа.
  const { total: newTotal } = computeOrderTotal({
    items: (rows ?? []).filter((r: any) => !r.is_removed),
    fulfillmentType: order.fulfillment_type,
    deliveryCity: order.delivery_city,
    deliveryCost: order.delivery_cost,
    isFirstOrder,
  })

  const { error: tErr } = await sb.from('orders').update({ total: newTotal }).eq('id', id)
  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 })

  // Аудит правки: триггер истории срабатывает только на смену статуса, поэтому
  // фиксируем правку состава отдельной записью (changed_by = текущий оператор).
  if (Number(order.total) !== newTotal) {
    await sb.from('order_history').insert({
      order_id: id,
      status_from: order.status,
      status_to: order.status,
      changed_by: authed.userId,
      note: `Правка состава: ${Math.round(Number(order.total))} ₸ → ${Math.round(newTotal)} ₸`,
    })
  }

  return NextResponse.json({ ok: true, total: newTotal })
}

import { NextRequest, NextResponse } from 'next/server'
import { getAuthedWithRole, sessionClient } from '@/lib/api-auth'
import { notifyOrderStatusChange } from '@/lib/order-status'

export const dynamic = 'force-dynamic'

// Допустимые целевые статусы (cart/pending назад не переводим).
// В работу: reserved. Дальше по конвейеру. Отмена: cancelled.
const ALLOWED = new Set([
  'reserved', 'confirmed', 'negotiation', 'in_transit', 'arrived',
  'assembling', 'assembled', 'delivered', 'cancelled',
])

// Смена статуса заказа. Историю (order_history.changed_by = auth.uid()) пишет
// триггер log_order_status_change — здесь руками НЕ дублируем. Списание остатка
// (confirm) и освобождение резервов (cancel/confirm) делают триггеры БД.
export async function POST(req: NextRequest) {
  const authed = await getAuthedWithRole(req, ['admin', 'manager'])
  if (!authed) return NextResponse.json({ error: 'Доступ запрещён' }, { status: 403 })

  const { order_id, to, driver_name, driver_phone, driver_car_plate } = await req.json().catch(() => ({}))
  const id = Number(order_id)
  if (!id || !to || !ALLOWED.has(to)) {
    return NextResponse.json({ error: 'order_id и корректный статус обязательны' }, { status: 400 })
  }

  // Передача курьеру (межгород → «В пути») требует данных водителя.
  const dName  = typeof driver_name === 'string' ? driver_name.trim() : ''
  const dPhone = typeof driver_phone === 'string' ? driver_phone.trim() : ''
  const dPlate = typeof driver_car_plate === 'string' ? driver_car_plate.trim() : ''
  if (to === 'in_transit' && (!dName || !dPhone || !dPlate)) {
    return NextResponse.json(
      { error: 'Для передачи курьеру заполните имя, номер машины и телефон водителя' },
      { status: 400 },
    )
  }

  const sb = sessionClient(req)

  const { data: cur, error: readErr } = await sb
    .from('orders').select('id, status').eq('id', id).maybeSingle()
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 })
  if (!cur) return NextResponse.json({ error: 'Заказ не найден' }, { status: 404 })
  if (cur.status === to) return NextResponse.json({ ok: true, status: to })

  // Данные водителя пишем в той же операции — до notify, чтобы уведомление «в пути»
  // и пуш в amoCRM подхватили их из свежей строки заказа.
  const patch: Record<string, unknown> = { status: to }
  if (dName)  patch.driver_name = dName
  if (dPhone) patch.driver_phone = dPhone
  if (dPlate) patch.driver_car_plate = dPlate

  const { data, error } = await sb
    .from('orders').update(patch).eq('id', id).select('id, status').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Переход реальный (статус отличался) → шлём уведомления (WhatsApp клиенту/менеджеру/
  // кладовщику) и двигаем сделку amoCRM. Сам UPDATE делаем сессионным клиентом, чтобы
  // триггер записал changed_by=оператор; побочные эффекты — общий helper (как в applyOrderStatus).
  // Ошибки внутри helper заглушены — не валят смену статуса.
  await notifyOrderStatusChange(id, to)

  return NextResponse.json({ ok: true, status: data.status })
}

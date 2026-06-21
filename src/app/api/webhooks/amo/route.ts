import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { applyOrderStatus } from '@/lib/order-status'
import {
  AMO_PIPELINE_ID, AMO_STATUS_TO_ORDER,
  getLead, leadFieldValue, CF_DRIVER_NAME, CF_DRIVER_PHONE, CF_CAR_PLATE, CF_DELIVERY_PRICE,
} from '@/lib/amo'

export const dynamic = 'force-dynamic'

// Входящий вебхук amoCRM → сайт (CRM = хозяин статуса).
// Менеджер двигает сделку в воронке → amo шлёт вебхук → находим заказ по amo_lead_id →
// меняем orders.status той же applyOrderStatus, что и кнопки админки (→ WhatsApp клиенту).
//
// Безопасность: amoCRM НЕ подписывает вебхуки. Защита — секрет в URL вебхука:
//   зарегистрировать https://uralskflowers.kz/api/webhooks/amo?secret=<AMO_WEBHOOK_SECRET>
// Роут сверяет ?secret с env AMO_WEBHOOK_SECRET (+ проверяет account[subdomain]).
// Без верного секрета → 401. (Скрипт регистрации вебхука — отдельным шагом.)
const EXPECTED_SUBDOMAIN = 'tropinvladislav1'

export async function POST(req: NextRequest) {
  // 1) Секрет из URL
  const secret = req.nextUrl.searchParams.get('secret')
  const expected = process.env.AMO_WEBHOOK_SECRET
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // 2) Тело amoCRM — application/x-www-form-urlencoded с вложенными ключами
  let params: URLSearchParams
  try {
    params = new URLSearchParams(await req.text())
  } catch {
    return NextResponse.json({ ok: true }) // не валим вебхук
  }

  // Доп. проверка аккаунта
  const subdomain = params.get('account[subdomain]')
  if (subdomain && subdomain !== EXPECTED_SUBDOMAIN) {
    return NextResponse.json({ ok: true }) // чужой аккаунт — игнор
  }

  // 3) Собираем lead_id из событий смены этапа и обновления полей
  const leadIds = new Set<number>()
  for (const key of params.keys()) {
    const m = key.match(/^leads\[(?:status|update)\]\[\d+\]\[id\]$/)
    if (m) {
      const id = parseInt(params.get(key) ?? '')
      if (Number.isFinite(id)) leadIds.add(id)
    }
  }
  if (leadIds.size === 0) return NextResponse.json({ ok: true })

  const supabase = createAdminClient()

  for (const leadId of leadIds) {
    try {
      // 4) Источник истины — полная сделка из amo (этап + кастомные поля)
      const lead = await getLead(leadId)
      if (!lead) continue
      if (lead.pipeline_id && lead.pipeline_id !== AMO_PIPELINE_ID) continue // не наша воронка

      // 5) Этап → order_status. Нет в маппинге (Новый/Incoming/прочее) → игнор.
      const newStatus = AMO_STATUS_TO_ORDER[lead.status_id]
      if (!newStatus) continue

      // 6) Заказ по amo_lead_id
      const { data: order } = await supabase
        .from('orders').select('id').eq('amo_lead_id', leadId).maybeSingle()
      if (!order) {
        console.warn(`[webhooks/amo] lead ${leadId}: заказ с amo_lead_id не найден`)
        continue
      }

      // 7) Поля доставки от менеджера (для текста «в пути»):
      //    «Имя водителя»(1680531)→driver_name, «Номер водителя»(1363771,тел)→driver_phone,
      //    «Номер машины»(1363769,госномер)→driver_car_plate, DELIVERY_PRICE→delivery_cost.
      const driverName   = leadFieldValue(lead, CF_DRIVER_NAME)
      const driverPhone  = leadFieldValue(lead, CF_DRIVER_PHONE)
      const carPlate     = leadFieldValue(lead, CF_CAR_PLATE)
      const priceRaw     = leadFieldValue(lead, CF_DELIVERY_PRICE)
      const deliveryCost = priceRaw != null && priceRaw !== '' && Number.isFinite(Number(priceRaw))
        ? Number(priceRaw) : null

      // 8) Та же логика, что у кнопок админки. skipAmoPush — не дёргаем сделку обратно.
      // Сообщение клиенту шлётся всегда (пустые поля скрываются в шаблоне) — без страховки-молчания.
      const res = await applyOrderStatus(order.id, newStatus, {
        changedBy: 'amocrm',
        driverName,
        driverPhone,
        driverCarPlate: carPlate,
        deliveryCost,
        skipAmoPush: true,
      })
      if (!res.ok) console.error(`[webhooks/amo] order ${order.id} → ${newStatus}: ${res.error}`)
      else console.log(`[webhooks/amo] order ${order.id} ← lead ${leadId}: ${newStatus}`)
    } catch (err) {
      console.error(`[webhooks/amo] lead ${leadId} failed:`, err instanceof Error ? err.message : err)
    }
  }

  // amoCRM ждёт 200 — иначе ретраит и шлёт уведомления о сбое
  return NextResponse.json({ ok: true })
}

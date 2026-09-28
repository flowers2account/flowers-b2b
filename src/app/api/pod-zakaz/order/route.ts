import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizePhone } from '@/lib/phone'
import { getAuthedUser } from '@/lib/api-auth'
import { umnicoClient } from '@/lib/umnico/client'
import { stepUnits, stepPrice, maxSteps, formatDeliveryDate, tradingDayLabel } from '@/lib/pod-zakaz/format'
import type { PfCatalogItem } from '@/lib/pod-zakaz/types'

export const dynamic = 'force-dynamic'

type RequestItem = { pfOfferId: number; qtySteps: number }

// Заявка на витрине «Под заказ» — НЕ заказ и НЕ оплата: клиент оставляет контакты,
// менеджер связывается сам и оформляет поставку вручную. В сторону Proflowers никаких
// запросов не уходит — это отдельная система поставщика.
export async function POST(req: NextRequest) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[pod-zakaz/order] SUPABASE_SERVICE_ROLE_KEY отсутствует — заявка отклонена')
    return NextResponse.json({ error: 'Оформление временно недоступно (конфигурация сервера)' }, { status: 503 })
  }

  const body = await req.json().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const rawPhone = typeof body?.phone === 'string' ? body.phone.trim() : ''
  const comment = typeof body?.comment === 'string' && body.comment.trim() ? body.comment.trim() : null
  const items: RequestItem[] = Array.isArray(body?.items)
    ? body.items
        .map((i: any) => ({ pfOfferId: Number(i?.pfOfferId), qtySteps: Number(i?.qtySteps) }))
        .filter((i: RequestItem) => Number.isFinite(i.pfOfferId) && Number.isInteger(i.qtySteps) && i.qtySteps > 0)
    : []

  if (!name) return NextResponse.json({ error: 'Укажите имя' }, { status: 400 })
  if (!rawPhone) return NextResponse.json({ error: 'Укажите телефон' }, { status: 400 })
  if (!items.length) return NextResponse.json({ error: 'Корзина пуста' }, { status: 400 })

  const clientPhone = normalizePhone(rawPhone)
  const supabase = createAdminClient()

  // Клиент необязателен (раздел работает и для незалогиненных) — client_id резолвим ТОЛЬКО
  // из валидного access-токена (как в других роутах), не из тела запроса — иначе можно
  // подставить чужой client_id.
  let clientId: string | null = null
  const authed = await getAuthedUser(req)
  if (authed) {
    const { data: client } = await supabase
      .from('clients')
      .select('id')
      .eq('auth_user_id', authed.userId)
      .maybeSingle()
    clientId = client?.id ?? null
  }

  // Цену/остаток/кратность берём ТОЛЬКО из pf_catalog — клиенту не доверяем ни цену,
  // ни расчёт коробок (та же логика ступеней, что в степпере карточки: format.ts).
  const offerIds = [...new Set(items.map(i => i.pfOfferId))]
  const { data: catalogRows, error: catalogError } = await supabase
    .from('pf_catalog')
    .select('*')
    .in('pf_offer_id', offerIds)

  if (catalogError) {
    console.error('[pod-zakaz/order] pf_catalog fetch failed:', catalogError.message)
    return NextResponse.json({ error: 'Не удалось проверить наличие' }, { status: 500 })
  }

  const catalogById = new Map((catalogRows ?? []).map((r: PfCatalogItem) => [r.pf_offer_id, r]))

  type Problem = { pfOfferId: number; name: string | null; available: number }
  const problems: Problem[] = []
  type Resolved = {
    item: PfCatalogItem
    qtySteps: number
    unitsPerStep: number
    unitPrice: number
    lineTotal: number
  }
  const resolved: Resolved[] = []

  // maxSteps()/stepPrice() — та же логика ступеней, что у степпера на карточке (format.ts):
  // is_box_only → шаг/максимум считаются коробками (box_multiplicity), иначе — multiplicity.
  // ИЗВЕСТНО (24.09.2026): живьём с is_box_only=true не протестировано — на момент проверки
  // в pf_catalog не было ни одной коробочной позиции с остатком >0. Код общий с рабочим
  // степпером, но отдельного факта для этого сценария нет — проверить, когда появится товар.
  for (const { pfOfferId, qtySteps } of items) {
    const catalogItem = catalogById.get(pfOfferId)
    if (!catalogItem) {
      problems.push({ pfOfferId, name: null, available: 0 })
      continue
    }
    const max = maxSteps(catalogItem)
    if (qtySteps > max) {
      problems.push({ pfOfferId, name: catalogItem.name, available: max })
      continue
    }
    const unitPrice = stepPrice(catalogItem)
    resolved.push({
      item: catalogItem,
      qtySteps,
      unitsPerStep: stepUnits(catalogItem),
      unitPrice,
      lineTotal: unitPrice * qtySteps,
    })
  }

  if (problems.length > 0) {
    return NextResponse.json({ error: 'stock_changed', items: problems }, { status: 400 })
  }

  const total = resolved.reduce((s, r) => s + r.lineTotal, 0)

  const { data: order, error: orderError } = await supabase
    .from('pf_orders')
    .insert({ client_name: name, client_phone: clientPhone, client_id: clientId, comment, total })
    .select('id')
    .single()

  if (orderError || !order) {
    console.error('[pod-zakaz/order] insert order failed:', orderError?.message)
    return NextResponse.json({ error: 'Не удалось сохранить заявку' }, { status: 500 })
  }

  const { error: itemsError } = await supabase.from('pf_order_items').insert(
    resolved.map(r => ({
      order_id: order.id,
      pf_offer_id: r.item.pf_offer_id,
      name: r.item.name,
      color_name: r.item.color_name,
      is_box_only: r.item.is_box_only,
      qty_steps: r.qtySteps,
      step_units: r.unitsPerStep,
      unit_price: r.unitPrice,
      line_total: r.lineTotal,
      trading_day_date: r.item.trading_day_date,
    })),
  )

  if (itemsError) {
    console.error('[pod-zakaz/order] insert items failed:', itemsError.message)
    return NextResponse.json({ error: 'Не удалось сохранить позиции заявки' }, { status: 500 })
  }

  // Уведомление менеджеру — ПОСЛЕ успешного сохранения заявки. Заявка остаётся валидной,
  // даже если Umnico недоступен; manager_notified=true только при подтверждённой отправке,
  // чтобы недоставленные заявки было видно.
  // ИЗВЕСТНО (24.09.2026): checkContact сейчас возвращает 400 с пустым телом для ЛЮБОГО
  // номера (манагерского и склада) — дохлая WhatsApp-сессия на стороне Umnico для
  // saId=UMNICO_WHATSAPP_SA_ID (105641), не баг этого роута и не проблема формата номера.
  // Чинится переподключением сессии в кабинете Umnico (владелец) — после починки заявки
  // начнут доходить сами, без правок кода. До этого manager_notified будет оставаться false.
  try {
    const mgr = process.env.UMNICO_MANAGER_PHONE
    if (mgr && (await umnicoClient.checkContact(mgr))) {
      const lines = resolved.map(r =>
        `• ${r.item.name}${r.item.color_name ? ` (${r.item.color_name})` : ''} — ${r.qtySteps} × ${r.unitPrice.toLocaleString('ru-RU')} ₸ = ${r.lineTotal.toLocaleString('ru-RU')} ₸`
      )
      const dates = [...new Set(resolved.map(r =>
        `${tradingDayLabel(r.item.trading_day_type)}${r.item.trading_day_date ? ` · поставка ${formatDeliveryDate(r.item.trading_day_date)}` : ''}`
      ))]
      const text = [
        '🆕 Заявка «Под заказ» (Proflowers)',
        `👤 ${name}`,
        `📞 ${clientPhone}`,
        '',
        ...lines,
        '',
        `Итого: ${total.toLocaleString('ru-RU')} ₸`,
        dates.length ? dates.join(' / ') : null,
        comment ? `Комментарий: ${comment}` : null,
      ].filter(Boolean).join('\n')

      const sent = await umnicoClient.sendMessage(mgr, text)
      if (sent) {
        await supabase.from('pf_orders').update({ manager_notified: true }).eq('id', order.id)
      }
    }
  } catch (e) {
    console.error('[pod-zakaz/order] manager notify failed:', e instanceof Error ? e.message : e)
  }

  return NextResponse.json({ orderId: order.id, total })
}

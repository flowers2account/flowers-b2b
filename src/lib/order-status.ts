import { createAdminClient } from '@/lib/supabase/admin'
import { umnicoClient } from '@/lib/umnico/client'
import { umnicoTemplates } from '@/lib/umnico/templates'

// Единая точка смены статуса заказа (раньше жила инлайном в PATCH /api/orders/[id]).
// Переиспользуется и кнопками админки, и входящим вебхуком amoCRM (CRM→сайт), чтобы
// механика WhatsApp-уведомлений срабатывала одинаково, без сырых UPDATE в разных местах.

export type ApplyStatusResult =
  | { ok: true }
  | { ok: false; httpStatus: number; error: string }

interface Opts {
  changedBy?: string | null
  paymentMethod?: string
  paymentComment?: string
  // Поля доставки от менеджера (приходят из amoCRM на этапе «на доставке»):
  driverName?: string | null
  driverPhone?: string | null
  driverCarPlate?: string | null
  deliveryCost?: number | null
  // Вебхук CRM→сайт не должен дёргать сделку обратно (хотя циклов мы не боимся — кнопки
  // замораживаются отдельно). true → пропустить updateLeadStage (сайт→CRM).
  skipAmoPush?: boolean
  // true → не слать клиенту WhatsApp (напр. «на доставке» без имени водителя — защита от дырок).
  skipClientNotify?: boolean
}

export async function applyOrderStatus(
  orderId: number,
  status: string,
  opts: Opts = {},
): Promise<ApplyStatusResult> {
  const supabase = createAdminClient()

  // 1) Доп. поля (водитель/оплата) — плоский UPDATE, на атомарность перехода не влияет.
  //    Пишем всегда (идемпотентно), чтобы шаблон «в пути» подхватил данные водителя.
  const extra: Record<string, unknown> = {}
  if (opts.paymentMethod  !== undefined) extra.payment_method   = opts.paymentMethod
  if (opts.paymentComment !== undefined) extra.payment_comment  = opts.paymentComment
  if (opts.driverName     != null)       extra.driver_name      = opts.driverName
  if (opts.driverPhone    != null)       extra.driver_phone     = opts.driverPhone
  if (opts.driverCarPlate != null)       extra.driver_car_plate = opts.driverCarPlate
  if (opts.deliveryCost   != null)       extra.delivery_cost    = opts.deliveryCost
  if (Object.keys(extra).length > 0) {
    const { error } = await supabase.from('orders').update(extra).eq('id', orderId)
    if (error) return { ok: false, httpStatus: 500, error: error.message }
  }

  // 2) Атомарный идемпотентный переход статуса. RPC: pg_advisory_xact_lock(order_id) →
  //    параллельные вебхуки одного перехода сериализуются; «статус уже целевой» → changed=false.
  //    Списание FIFO (confirm_order_fifo) и история — AFTER-триггеры в ТОЙ ЖЕ транзакции,
  //    поэтому остаток списывается РОВНО один раз и статус не откатывается. JS вручную НЕ списывает.
  const { data: tr, error: trErr } = await supabase.rpc('apply_order_transition', {
    p_order_id: orderId,
    p_target: status,
    p_enforce_stock: true,
  })
  if (trErr) return { ok: false, httpStatus: 500, error: trErr.message }
  const result = (tr ?? {}) as { ok?: boolean; changed?: boolean; error?: string; previous?: string }
  if (!result.ok) {
    return { ok: false, httpStatus: result.error === 'not_found' ? 404 : 409, error: result.error ?? 'transition failed' }
  }
  if (result.changed !== true) {
    // Уже в целевом статусе (дубль/гонка вебхуков) — остаток не трогаем, уведомления не шлём.
    console.log(`[order-status] order ${orderId}: статус уже ${status} — no-op (идемпотентно)`)
    return { ok: true }
  }

  // 3) WhatsApp-уведомления (та же логика) + шаблон in_transit. Только при реальном переходе
  //    (сюда попадаем лишь когда RPC вернул changed=true) → дубли невозможны.
  if (process.env.UMNICO_API_TOKEN) {
    try {
      const [{ data: orderData }, { data: historyRecord }] = await Promise.all([
        supabase
          .from('orders')
          .select('id, total, guest_name, guest_phone, driver_name, driver_phone, driver_car_plate, delivery_date, clients(name, phone, company_name), order_items(qty_actual, qty_ordered, qty, price, is_removed, product:product_id(name))')
          .eq('id', orderId)
          .single(),
        supabase
          .from('order_history')
          .select('manager_name')
          .eq('order_id', orderId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])

      const clientPhone = (orderData?.clients as any)?.phone ?? orderData?.guest_phone
      const clientName = (orderData?.clients as any)?.name ?? orderData?.guest_name ?? 'Уважаемый клиент'
      const companyName = (orderData?.clients as any)?.company_name ?? undefined
      const managerName = (historyRecord as any)?.manager_name || 'Менеджер'
      const total = orderData?.total ?? 0
      const orderIdStr = String(orderId)

      const deliveredItems = status === 'delivered'
        ? ((orderData?.order_items ?? []) as any[])
            .filter(i => !i.is_removed)
            .map(i => ({ name: (i.product as any)?.name ?? 'Товар', qty: i.qty_actual ?? i.qty_ordered ?? i.qty }))
        : undefined

      let clientNotificationsEnabled = true
      try {
        const { data: setting } = await supabase
          .from('app_settings').select('value').eq('key', 'client_notifications_enabled').single()
        clientNotificationsEnabled = setting?.value !== 'false'
      } catch { /* default enabled */ }

      if (!opts.skipClientNotify && clientNotificationsEnabled && clientPhone) {
        const hasWhatsApp = await umnicoClient.checkContact(clientPhone)
        if (hasWhatsApp) {
          const clientMessage =
            status === 'confirmed'
              ? umnicoTemplates.orderConfirmedToClient({ orderId: orderIdStr, clientName, total })
              : status === 'assembled'
              ? umnicoTemplates.orderPackedToClient({ orderId: orderIdStr, clientName, total })
              : status === 'in_transit'
              ? umnicoTemplates.orderOnDeliveryToClient({
                  orderId: orderIdStr, clientName,
                  driverName: (orderData as any)?.driver_name ?? null,
                  driverPhone: (orderData as any)?.driver_phone ?? null,
                  driverCarPlate: (orderData as any)?.driver_car_plate ?? null,
                  deliveryDate: (orderData as any)?.delivery_date ?? null,
                })
              : status === 'delivered'
              ? umnicoTemplates.orderDeliveredToClient({ orderId: orderIdStr, clientName, total, items: deliveredItems })
              : status === 'cancelled'
              ? umnicoTemplates.orderCancelledToClient({ orderId: orderIdStr, clientName })
              : null
          // negotiation / assembling → клиенту НЕ шлём (менеджер сам / внутренний этап)

          if (clientMessage) {
            await umnicoClient.sendMessage(clientPhone, clientMessage)
            console.log(`✓ Umnico: клиенту (заказ ${orderId}, статус ${status})`)
          }
        }
      }

      const managerPhone = process.env.UMNICO_MANAGER_PHONE
      if (managerPhone) {
        const managerHasWhatsApp = await umnicoClient.checkContact(managerPhone)
        if (managerHasWhatsApp) {
          const managerMessage =
            status === 'confirmed'
              ? umnicoTemplates.orderConfirmedToManager({ orderId: orderIdStr, managerName, clientName, companyName, total })
              : status === 'assembled'
              ? umnicoTemplates.orderPackedToManager({ orderId: orderIdStr, managerName, clientName, companyName, total })
              : status === 'delivered'
              ? umnicoTemplates.orderDeliveredToManager({ orderId: orderIdStr, managerName, clientName, companyName, total, items: deliveredItems })
              : null

          if (managerMessage) {
            await umnicoClient.sendMessage(managerPhone, managerMessage)
            console.log(`✓ Umnico: менеджеру (заказ ${orderId}, статус ${status})`)
          }
        }
      }
    } catch (err) {
      console.error('Umnico notification failed:', err)
    }
  }

  // amoCRM: двигаем сделку по воронке (сайт→CRM). Для вебхука CRM→сайт пропускаем.
  // Сюда доходим только при реальном переходе (changed=true).
  if (!opts.skipAmoPush) {
    try {
      const { updateLeadStage } = await import('@/lib/amo')
      await updateLeadStage(orderId)
    } catch (err) {
      console.error('[order-status] amoCRM stage update failed:', err instanceof Error ? err.message : err)
    }
  }

  return { ok: true }
}

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
  deliveryCost?: number | null
  // Вебхук CRM→сайт не должен дёргать сделку обратно (хотя циклов мы не боимся — кнопки
  // замораживаются отдельно). true → пропустить updateLeadStage (сайт→CRM).
  skipAmoPush?: boolean
}

export async function applyOrderStatus(
  orderId: number,
  status: string,
  opts: Opts = {},
): Promise<ApplyStatusResult> {
  const supabase = createAdminClient()

  const { data: order } = await supabase
    .from('orders').select('status').eq('id', orderId).single()
  if (!order) return { ok: false, httpStatus: 404, error: 'Not found' }

  // Реальный переход статуса? Вебхук CRM может слать тот же этап повторно (правка полей
  // на «на доставке») — тогда НЕ списываем повторно остаток, НЕ пишем историю, НЕ шлём WhatsApp.
  const statusChanged = order.status !== status

  const updateFields: Record<string, unknown> = { status }
  if (opts.paymentMethod !== undefined) updateFields.payment_method = opts.paymentMethod
  if (opts.paymentComment !== undefined) updateFields.payment_comment = opts.paymentComment
  // Поля водителя/стоимости — пишем ДО уведомлений, чтобы шаблон «в пути» их подхватил.
  if (opts.driverName  != null) updateFields.driver_name  = opts.driverName
  if (opts.driverPhone != null) updateFields.driver_phone = opts.driverPhone
  if (opts.deliveryCost != null) updateFields.delivery_cost = opts.deliveryCost

  const { error: updateError } = await supabase
    .from('orders').update(updateFields).eq('id', orderId)
  if (updateError) return { ok: false, httpStatus: 500, error: updateError.message }

  // confirmed → списываем остатки и снимаем резервы (как в кнопке «Подтвердить»).
  // Только при реальном переходе — иначе повторный вебхук списал бы остаток дважды.
  if (status === 'confirmed' && statusChanged) {
    const { data: orderItems } = await supabase
      .from('order_items')
      .select('product_id, qty, product:product_id(name)')
      .eq('order_id', orderId)

    const shortages: string[] = []
    for (const item of orderItems ?? []) {
      const { data: product } = await supabase
        .from('products').select('qty').eq('id', item.product_id).single()
      if (!product || product.qty < item.qty) {
        const available = product?.qty ?? 0
        const name = (item.product as any)?.name ?? `Товар #${item.product_id}`
        shortages.push(`${name} — в остатке только ${available} шт`)
      }
    }
    if (shortages.length > 0) {
      await supabase.from('orders').update({ status: order.status }).eq('id', orderId)
      return { ok: false, httpStatus: 409, error: shortages.join('; ') }
    }
    for (const item of orderItems ?? []) {
      const { data: product } = await supabase
        .from('products').select('qty').eq('id', item.product_id).single()
      if (product) {
        await supabase.from('products')
          .update({ qty: product.qty - item.qty }).eq('id', item.product_id)
      }
    }
    await supabase.from('reservations').delete().eq('order_id', orderId)
  }

  if (statusChanged) {
    await supabase.from('order_history').insert({
      order_id: orderId,
      status_from: order.status,
      status_to: status,
      changed_by: opts.changedBy ?? null,
    })
  }

  // WhatsApp-уведомления (та же логика, что была в роуте) + новый шаблон in_transit.
  // Только при реальном переходе статуса — чтобы повторные вебхуки не слали дубли.
  if (statusChanged && process.env.UMNICO_API_TOKEN) {
    try {
      const [{ data: orderData }, { data: historyRecord }] = await Promise.all([
        supabase
          .from('orders')
          .select('id, total, guest_name, guest_phone, driver_name, driver_phone, delivery_date, clients(name, phone, company_name), order_items(qty_actual, qty_ordered, qty, price, is_removed, product:product_id(name))')
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

      if (clientNotificationsEnabled && clientPhone) {
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
  if (statusChanged && !opts.skipAmoPush) {
    try {
      const { updateLeadStage } = await import('@/lib/amo')
      await updateLeadStage(orderId)
    } catch (err) {
      console.error('[order-status] amoCRM stage update failed:', err instanceof Error ? err.message : err)
    }
  }

  return { ok: true }
}

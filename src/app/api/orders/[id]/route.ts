import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { umnicoClient } from '@/lib/umnico/client'
import { umnicoTemplates } from '@/lib/umnico/templates'

export const dynamic = 'force-dynamic'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params
  const orderId = parseInt(id)

  const { status, changed_by, payment_method, payment_comment } = await req.json()
  if (!status) return NextResponse.json({ error: 'Missing status' }, { status: 400 })

  const { data: order } = await supabase
    .from('orders')
    .select('status')
    .eq('id', orderId)
    .single()

  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updateFields: Record<string, unknown> = { status }
  if (payment_method !== undefined) updateFields.payment_method = payment_method
  if (payment_comment !== undefined) updateFields.payment_comment = payment_comment

  const { error: updateError } = await supabase
    .from('orders')
    .update(updateFields)
    .eq('id', orderId)

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  // For confirmed status: deduct qty from products and clear reservations
  if (status === 'confirmed') {
    const { data: orderItems } = await supabase
      .from('order_items')
      .select('product_id, qty, product:product_id(name)')
      .eq('order_id', orderId)

    const shortages: string[] = []
    for (const item of orderItems ?? []) {
      const { data: product } = await supabase
        .from('products')
        .select('qty')
        .eq('id', item.product_id)
        .single()

      if (!product || product.qty < item.qty) {
        const available = product?.qty ?? 0
        const name = (item.product as any)?.name ?? `Товар #${item.product_id}`
        shortages.push(`${name} — в остатке только ${available} шт`)
      }
    }

    if (shortages.length > 0) {
      await supabase.from('orders').update({ status: order.status }).eq('id', orderId)
      return NextResponse.json({ error: shortages.join('; ') }, { status: 409 })
    }

    for (const item of orderItems ?? []) {
      const { data: product } = await supabase
        .from('products')
        .select('qty')
        .eq('id', item.product_id)
        .single()
      if (product) {
        await supabase
          .from('products')
          .update({ qty: product.qty - item.qty })
          .eq('id', item.product_id)
      }
    }

    await supabase.from('reservations').delete().eq('order_id', orderId)
  }

  await supabase.from('order_history').insert({
    order_id: orderId,
    status_from: order.status,
    status_to: status,
    changed_by: changed_by ?? null,
  })

  if (process.env.UMNICO_API_TOKEN) {
    try {
      const [{ data: orderData }, { data: historyRecord }] = await Promise.all([
        supabase
          .from('orders')
          .select('id, total, guest_name, guest_phone, clients(name, phone, company_name), order_items(qty_actual, qty_ordered, qty, price, is_removed, product:product_id(name))')
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
            .map(i => ({
              name: (i.product as any)?.name ?? 'Товар',
              qty: i.qty_actual ?? i.qty_ordered ?? i.qty,
            }))
        : undefined

      let clientNotificationsEnabled = true
      try {
        const { data: setting } = await supabase
          .from('app_settings').select('value').eq('key', 'client_notifications_enabled').single()
        clientNotificationsEnabled = setting?.value !== 'false'
      } catch {
        // default to enabled
      }

      if (clientNotificationsEnabled && clientPhone) {
        const hasWhatsApp = await umnicoClient.checkContact(clientPhone)
        if (hasWhatsApp) {
          const clientMessage =
            status === 'confirmed'
              ? umnicoTemplates.orderConfirmedToClient({ orderId: orderIdStr, clientName, total })
              : status === 'assembled'
              ? umnicoTemplates.orderPackedToClient({ orderId: orderIdStr, clientName, total })
              : status === 'delivered'
              ? umnicoTemplates.orderDeliveredToClient({ orderId: orderIdStr, clientName, total, items: deliveredItems })
              : status === 'cancelled'
              ? umnicoTemplates.orderCancelledToClient({ orderId: orderIdStr, clientName })
              : null

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

  // amoCRM: двигаем сделку по воронке (non-fatal)
  try {
    const { updateLeadStage } = await import('@/lib/amo')
    await updateLeadStage(orderId)
  } catch (err) {
    console.error('[orders/[id]] amoCRM stage update failed:', err instanceof Error ? err.message : err)
  }

  return NextResponse.json({ success: true })
}

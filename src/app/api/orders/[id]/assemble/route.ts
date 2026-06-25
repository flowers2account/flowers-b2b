import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { umnicoClient, notifyOrderChain } from '@/lib/umnico/client'
import { umnicoTemplates } from '@/lib/umnico/templates'

export const dynamic = 'force-dynamic'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createAdminClient()
  const { id } = await params
  const orderId = Number(id)

  const { changed_by, assembly_photo_url, items } = await req.json()
  if (!items?.length) return NextResponse.json({ error: 'Missing items' }, { status: 400 })

  const { data: order } = await supabase
    .from('orders')
    .select('status')
    .eq('id', orderId)
    .single()

  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  for (const item of items) {
    const { error: itemError } = await supabase
      .from('order_items')
      .update({ qty_actual: item.qty_actual, is_removed: item.is_removed })
      .eq('id', item.id)
    if (itemError) console.error('ORDER_ITEM UPDATE ERROR:', itemError)
  }

  const { data: updatedItems, error: itemsSelectError } = await supabase
    .from('order_items')
    .select('qty_actual, qty_ordered, price, color, is_removed, product:product_id(name, display_name)')
    .eq('order_id', orderId)

  if (itemsSelectError) console.error('ORDER_ITEMS SELECT ERROR:', itemsSelectError)

  const liveItems = (updatedItems ?? []).filter((i: any) => !i.is_removed)
  const newTotal = liveItems.reduce((sum: number, i: any) => sum + (i.qty_actual ?? i.qty_ordered) * i.price, 0)
  // Перечень для уведомлений: клиенту — витринное имя, менеджеру — 1С; + цвет + кол-во.
  const qtyOf = (i: any) => i.qty_actual ?? i.qty_ordered ?? 0
  const clientItems = liveItems.map((i: any) => ({
    name: i.product?.display_name ?? i.product?.name ?? 'Товар', color: i.color ?? null, qty: qtyOf(i),
  }))
  const managerItems = liveItems.map((i: any) => ({
    name: i.product?.name ?? i.product?.display_name ?? 'Товар', color: i.color ?? null, qty: qtyOf(i),
  }))

  const { error: updateError } = await supabase
    .from('orders')
    .update({
      status: 'assembled',
      total: newTotal,
      assembly_photo_url: assembly_photo_url ?? null,
      assembled_at: new Date().toISOString(),
      assembled_by: changed_by ?? null,
    })
    .eq('id', Number(id))

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  const { error: historyError } = await supabase.from('order_history').insert({
    order_id: orderId,
    status_from: order.status,
    status_to: 'assembled',
    changed_by: changed_by ?? null,
  })
  if (historyError) console.error('HISTORY INSERT ERROR:', historyError)

  if (process.env.UMNICO_API_TOKEN) {
    try {
      const { data: orderData, error: orderFetchError } = await supabase
        .from('orders')
        .select('total, guest_phone, guest_name, fulfillment_type, clients(name, phone)')
        .eq('id', orderId)
        .single()

      console.log('Order fetch error:', orderFetchError?.message ?? 'none')
      console.log('Order data:', JSON.stringify(orderData))

      const clientPhone = (orderData?.clients as any)?.phone ?? orderData?.guest_phone ?? null
      const clientName = (orderData?.clients as any)?.name ?? orderData?.guest_name ?? 'Уважаемый клиент'
      const total = orderData?.total ?? newTotal
      const photoUrl = assembly_photo_url ?? undefined
      const managerPhone = process.env.UMNICO_MANAGER_PHONE ?? null

      const { data: historyRecord } = await supabase
        .from('order_history')
        .select('manager_name')
        .eq('order_id', orderId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      let managerName = historyRecord?.manager_name || null

      if (!managerName && changed_by) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', changed_by)
          .maybeSingle()
        managerName = (profile as any)?.full_name || null
      }

      managerName = managerName || 'Менеджер'

      console.log('Client phone:', clientPhone)
      console.log('Client name:', clientName)
      console.log('Manager phone:', managerPhone)
      console.log('Manager name:', managerName)

      if (clientPhone) {
        const hasWhatsApp = await umnicoClient.checkContact(clientPhone)
        console.log('Client hasWhatsApp:', hasWhatsApp)
        if (hasWhatsApp) {
          // Текст ветвится по способу получения; если есть фото сборки — шлём картинкой.
          const ff = (orderData as any)?.fulfillment_type
          const msg = ff === 'pickup'
            ? umnicoTemplates.orderAssembledPickupToClient({ orderId: String(orderId), items: clientItems })
            : umnicoTemplates.orderAssembledDeliveryToClient({ orderId: String(orderId), items: clientItems })
          if (photoUrl) {
            await umnicoClient.sendImage(clientPhone, photoUrl, msg)
          } else {
            await umnicoClient.sendMessage(clientPhone, msg)
          }
          console.log(`✓ Umnico: клиенту о сборке заказа ${orderId} (${ff === 'pickup' ? 'самовывоз' : 'доставка'}${photoUrl ? ', с фото' : ''})`)
        }
      } else {
        console.log('⚠ Umnico: clientPhone not found, skipping client notification')
      }

      // Менеджеру И кладовщику (→ orderNotifyPhones)
      await notifyOrderChain(
        umnicoTemplates.orderPackedToManager({ orderId: String(orderId), managerName, total, items: managerItems })
      )
      console.log(`✓ Umnico: менеджеру+кладовщику о сборке заказа ${orderId}`)
    } catch (err) {
      console.error('Umnico assembled notification failed:', err)
    }
  } else {
    console.log('⚠ UMNICO_API_TOKEN not set, skipping all notifications')
  }

  // amoCRM: двигаем сделку → «Готово к выдаче» (non-fatal)
  try {
    const { updateLeadStage } = await import('@/lib/amo')
    await updateLeadStage(orderId)
  } catch (err) {
    console.error('[assemble] amoCRM stage update failed:', err instanceof Error ? err.message : err)
  }

  return NextResponse.json({ success: true })
}

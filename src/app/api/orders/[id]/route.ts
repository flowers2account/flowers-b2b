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

  const { status, changed_by } = await req.json()
  if (!status) return NextResponse.json({ error: 'Missing status' }, { status: 400 })

  const { data: order } = await supabase
    .from('orders')
    .select('status')
    .eq('id', orderId)
    .single()

  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { error: updateError } = await supabase
    .from('orders')
    .update({ status })
    .eq('id', orderId)

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  // For confirmed status, also run FIFO stock deduction
  if (status === 'confirmed') {
    const { error: rpcError } = await supabase.rpc('confirm_order_fifo', { p_order_id: orderId })
    if (rpcError) {
      // Rollback status
      await supabase.from('orders').update({ status: order.status }).eq('id', orderId)

      if (rpcError.message.includes('stock_reserved_lte_qty')) {
        // Find which items have insufficient stock
        const { data: orderItems } = await supabase
          .from('order_items')
          .select('qty, product_id, product:product_id(name)')
          .eq('order_id', orderId)

        const { data: stockRows } = await supabase
          .from('stock')
          .select('product_id, qty')
          .in('product_id', (orderItems ?? []).map((i: any) => i.product_id))

        const stockMap = Object.fromEntries((stockRows ?? []).map((s: any) => [s.product_id, s.qty]))

        const shortages = (orderItems ?? [])
          .filter((i: any) => i.qty > (stockMap[i.product_id] ?? 0))
          .map((i: any) => {
            const available = stockMap[i.product_id] ?? 0
            const name = (i.product as any)?.name ?? `Товар #${i.product_id}`
            return `${name} — в остатке только ${available} шт`
          })

        const message = shortages.length > 0
          ? shortages.join('; ')
          : 'Недостаточно товара на складе'

        return NextResponse.json({ error: message }, { status: 409 })
      }

      return NextResponse.json({ error: rpcError.message }, { status: 500 })
    }
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

      if (clientPhone) {
        const hasWhatsApp = await umnicoClient.checkContact(clientPhone)
        if (hasWhatsApp) {
          const clientMessage =
            status === 'confirmed'
              ? umnicoTemplates.orderConfirmedToClient({ orderId: orderIdStr, clientName, total })
              : status === 'assembled'
              ? umnicoTemplates.orderPackedToClient({ orderId: orderIdStr, clientName, total })
              : status === 'delivered'
              ? umnicoTemplates.orderDeliveredToClient({ orderId: orderIdStr, clientName, total, items: deliveredItems })
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

  return NextResponse.json({ success: true })
}

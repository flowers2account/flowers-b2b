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
    if (rpcError) return NextResponse.json({ error: rpcError.message }, { status: 500 })
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
          .select('id, total, clients(name, phone)')
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

      const clientPhone = (orderData?.clients as any)?.phone
      const clientName = (orderData?.clients as any)?.name || 'Уважаемый клиент'
      const managerName = (historyRecord as any)?.manager_name || 'Менеджер'
      const total = orderData?.total ?? 0
      const orderIdStr = String(orderId)

      if (clientPhone) {
        const hasWhatsApp = await umnicoClient.checkContact(clientPhone)
        if (hasWhatsApp) {
          const clientMessage =
            status === 'confirmed'
              ? umnicoTemplates.orderConfirmedToClient({ orderId: orderIdStr, clientName, total })
              : status === 'assembled'
              ? umnicoTemplates.orderPackedToClient({ orderId: orderIdStr, clientName, total })
              : status === 'delivered'
              ? umnicoTemplates.orderDeliveredToClient({ orderId: orderIdStr, clientName, total })
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
              ? umnicoTemplates.orderConfirmedToManager({ orderId: orderIdStr, managerName, total })
              : status === 'assembled'
              ? umnicoTemplates.orderPackedToManager({ orderId: orderIdStr, managerName, total })
              : status === 'delivered'
              ? umnicoTemplates.orderDeliveredToManager({ orderId: orderIdStr, managerName, total })
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

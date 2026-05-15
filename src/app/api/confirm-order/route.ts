import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { umnicoClient } from '@/lib/umnico/client'
import { umnicoTemplates } from '@/lib/umnico/templates'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = await createClient()

  const { order_id, status = 'confirmed' } = await req.json()

  await supabase.from('orders').update({ status }).eq('id', order_id)

  if (status === 'confirmed') {
    const { error } = await supabase.rpc('confirm_order_fifo', { p_order_id: order_id })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (process.env.UMNICO_API_TOKEN) {
    try {
      const [{ data: order }, { data: historyRecord }] = await Promise.all([
        supabase
          .from('orders')
          .select('id, total, clients(name, phone)')
          .eq('id', order_id)
          .single(),
        supabase
          .from('order_history')
          .select('manager_name')
          .eq('order_id', order_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])

      const clientPhone = (order?.clients as any)?.phone
      const clientName = (order?.clients as any)?.name || 'Уважаемый клиент'
      const managerName = (historyRecord as any)?.manager_name || 'Менеджер'
      const total = order?.total ?? 0
      const orderId = String(order_id)

      if (clientPhone) {
        const hasWhatsApp = await umnicoClient.checkContact(clientPhone)
        if (hasWhatsApp) {
          const clientMessage =
            status === 'confirmed'
              ? umnicoTemplates.orderConfirmedToClient({ orderId, clientName, total })
              : status === 'packed' || status === 'ready'
              ? umnicoTemplates.orderPackedToClient({ orderId, clientName, total })
              : status === 'delivered'
              ? umnicoTemplates.orderDeliveredToClient({ orderId, clientName, total })
              : null

          if (clientMessage) {
            await umnicoClient.sendMessage(clientPhone, clientMessage)
            console.log(`✓ Umnico: клиенту (заказ ${order_id}, статус ${status})`)
          }
        }
      }

      const managerPhone = process.env.UMNICO_MANAGER_PHONE
      if (managerPhone) {
        const managerHasWhatsApp = await umnicoClient.checkContact(managerPhone)
        if (managerHasWhatsApp) {
          const managerMessage =
            status === 'confirmed'
              ? umnicoTemplates.orderConfirmedToManager({ orderId, managerName, total })
              : status === 'packed' || status === 'ready'
              ? umnicoTemplates.orderPackedToManager({ orderId, managerName, total })
              : status === 'delivered'
              ? umnicoTemplates.orderDeliveredToManager({ orderId, managerName, total })
              : null

          if (managerMessage) {
            await umnicoClient.sendMessage(managerPhone, managerMessage)
            console.log(`✓ Umnico: менеджеру (заказ ${order_id}, статус ${status})`)
          }
        }
      }
    } catch (err) {
      console.error('Umnico notification failed:', err)
    }
  }

  return NextResponse.json({ success: true })
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { umnicoClient } from '@/lib/umnico/client'
import { umnicoTemplates } from '@/lib/umnico/templates'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = await createClient()

  const { order_id } = await req.json()

  await supabase.from('orders').update({ status: 'confirmed' }).eq('id', order_id)
  const { error } = await supabase.rpc('confirm_order_fifo', { p_order_id: order_id })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (process.env.UMNICO_API_TOKEN) {
    try {
      const { data: order } = await supabase
        .from('orders')
        .select('id, total, clients(name, phone)')
        .eq('id', order_id)
        .single()

      const clientPhone = (order?.clients as any)?.phone
      const clientName = (order?.clients as any)?.name || 'Уважаемый клиент'

      if (order && clientPhone) {
        const hasWhatsApp = await umnicoClient.checkContact(clientPhone)

        if (hasWhatsApp) {
          await umnicoClient.sendMessage(
            clientPhone,
            umnicoTemplates.orderConfirmedToClient({
              orderId: String(order.id),
              clientName,
              total: order.total ?? 0
            })
          )
          console.log(`✓ Umnico: подтверждение клиенту (заказ ${order.id})`)
        }
      }
    } catch (error) {
      console.error('Umnico client notification failed:', error)
    }
  }

  return NextResponse.json({ success: true })
}

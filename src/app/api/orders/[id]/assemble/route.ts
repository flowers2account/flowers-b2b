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
    if (itemError) console.log('ORDER_ITEM UPDATE ERROR:', itemError)
  }

  const { data: updatedItems, error: itemsSelectError } = await supabase
    .from('order_items')
    .select('qty_actual, qty_ordered, price, is_removed')
    .eq('order_id', orderId)

  if (itemsSelectError) console.log('ORDER_ITEMS SELECT ERROR:', itemsSelectError)

  const newTotal = (updatedItems ?? [])
    .filter((i: any) => !i.is_removed)
    .reduce((sum: number, i: any) => sum + (i.qty_actual ?? i.qty_ordered) * i.price, 0)

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

  console.log('UPDATE ERROR:', updateError)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  const { error: historyError } = await supabase.from('order_history').insert({
    order_id: orderId,
    status_from: order.status,
    status_to: 'assembled',
    changed_by: changed_by ?? null,
  })
  if (historyError) console.log('HISTORY INSERT ERROR:', historyError)

  console.log('=== ASSEMBLE: Starting notifications ===')
  console.log('Order ID:', orderId)
  console.log('UMNICO_API_TOKEN set:', !!process.env.UMNICO_API_TOKEN)
  console.log('Photo URL:', assembly_photo_url ?? 'none')

  if (process.env.UMNICO_API_TOKEN) {
    try {
      const { data: orderData, error: orderFetchError } = await supabase
        .from('orders')
        .select('total, guest_phone, guest_name, clients(name, phone)')
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
        .eq('status_to', 'assembled')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const managerName = historyRecord?.manager_name || 'Менеджер'

      console.log('Client phone:', clientPhone)
      console.log('Client name:', clientName)
      console.log('Manager phone:', managerPhone)
      console.log('Manager name:', managerName)

      if (clientPhone) {
        const hasWhatsApp = await umnicoClient.checkContact(clientPhone)
        console.log('Client hasWhatsApp:', hasWhatsApp)
        if (hasWhatsApp) {
          await umnicoClient.sendMessage(
            clientPhone,
            umnicoTemplates.orderPackedToClient({ orderId: String(orderId), clientName, total, photoUrl })
          )
          console.log(`✓ Umnico: клиенту о сборке заказа ${orderId}`)
        }
      } else {
        console.log('⚠ Umnico: clientPhone not found, skipping client notification')
      }

      if (managerPhone) {
        const managerHasWhatsApp = await umnicoClient.checkContact(managerPhone)
        console.log('Manager hasWhatsApp:', managerHasWhatsApp)
        if (managerHasWhatsApp) {
          await umnicoClient.sendMessage(
            managerPhone,
            umnicoTemplates.orderPackedToManager({ orderId: String(orderId), managerName, total })
          )
          console.log(`✓ Umnico: менеджеру о сборке заказа ${orderId}`)
        }
      } else {
        console.log('⚠ Umnico: UMNICO_MANAGER_PHONE not set, skipping manager notification')
      }
    } catch (err) {
      console.error('Umnico assembled notification failed:', err)
    }
  } else {
    console.log('⚠ UMNICO_API_TOKEN not set, skipping all notifications')
  }

  return NextResponse.json({ success: true })
}

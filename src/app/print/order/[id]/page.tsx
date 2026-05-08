import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import PrintActions from '@/components/print/PrintActions'

const statusLabel: Record<string, string> = {
  pending: 'Новый',
  reserved: 'В брони',
  confirmed: 'Подтверждён',
  assembling: 'В сборке',
  assembled: 'Готово к выдаче',
  cancelled: 'Отменён',
  delivered: 'Выдан',
}

function fmt(n: number) {
  return n?.toLocaleString('ru-RU') + ' ₸'
}

export default async function PrintOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const orderId = parseInt(id)
  if (isNaN(orderId)) notFound()

  const supabase = await createClient()
  const { data: order } = await supabase
    .from('orders')
    .select(`id, status, total, notes, created_at, guest_phone, guest_name,
             client:client_id(name, phone),
             order_items(id, qty, qty_ordered, qty_actual, is_removed, price, product:product_id(name))`)
    .eq('id', orderId)
    .single()

  if (!order) notFound()

  const o = order as any
  const clientName = o.client?.name ?? o.guest_name ?? '—'
  const clientPhone = o.client?.phone ?? o.guest_phone ?? null
  const date = new Date(o.created_at).toLocaleDateString('ru-RU', {
    timeZone: 'Asia/Oral', day: '2-digit', month: '2-digit', year: 'numeric',
  })

  const activeItems = (o.order_items as any[]).filter((i: any) => !i.is_removed)
  const removedItems = (o.order_items as any[]).filter((i: any) => i.is_removed)
  const changedItems = activeItems.filter((i: any) => i.qty_actual !== null && i.qty_actual !== (i.qty_ordered ?? i.qty))
  const hasAssemblyChanges = removedItems.length > 0 || changedItems.length > 0

  const printTotal = activeItems.reduce(
    (sum: number, i: any) => sum + (i.qty_actual ?? i.qty_ordered ?? i.qty) * i.price,
    0
  )

  return (
    <div className="max-w-2xl mx-auto px-8 py-6 text-gray-900">
      <PrintActions />

      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold">Накладная №{o.id}</h1>
        <p className="text-sm text-gray-500 mt-1">
          от {date} · {statusLabel[o.status] ?? o.status}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-6 text-sm border-t border-b border-gray-200 py-4">
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase mb-1">Продавец</p>
          <p className="font-medium">ТОО Цветы Уральска</p>
        </div>
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase mb-1">Покупатель</p>
          <p className="font-medium">{clientName}</p>
          {clientPhone && <p className="text-gray-600">{clientPhone}</p>}
        </div>
      </div>

      <table className="w-full text-sm border-collapse mb-4">
        <thead>
          <tr className="border-b-2 border-gray-800">
            <th className="text-left py-2 pr-2 text-xs font-semibold text-gray-500 w-6">#</th>
            <th className="text-left py-2 pr-3 text-xs font-semibold text-gray-500">Наименование</th>
            <th className="text-center py-2 px-3 text-xs font-semibold text-gray-500 w-16">Кол-во</th>
            <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500 w-24">Цена</th>
            <th className="text-right py-2 pl-3 text-xs font-semibold text-gray-500 w-24">Сумма</th>
          </tr>
        </thead>
        <tbody>
          {activeItems.map((item: any, idx: number) => {
            const qty = item.qty_actual ?? item.qty_ordered ?? item.qty
            return (
              <tr key={item.id} className="border-b border-gray-200">
                <td className="py-2 pr-2 text-gray-400">{idx + 1}</td>
                <td className="py-2 pr-3">{item.product?.name ?? `Товар #${item.id}`}</td>
                <td className="py-2 px-3 text-center">{qty}</td>
                <td className="py-2 px-3 text-right">{fmt(item.price)}</td>
                <td className="py-2 pl-3 text-right font-medium">{fmt(qty * item.price)}</td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-gray-800">
            <td colSpan={4} className="py-3 pr-3 text-right font-semibold">Итого:</td>
            <td className="py-3 pl-3 text-right font-bold text-base">{fmt(printTotal)}</td>
          </tr>
        </tfoot>
      </table>

      {o.notes && (
        <div className="text-sm text-gray-600 border rounded p-3 mb-4">
          <span className="font-semibold">Примечания: </span>{o.notes}
        </div>
      )}

      {hasAssemblyChanges && (
        <div className="text-sm border border-gray-300 rounded p-3 mb-6 bg-gray-50">
          <p className="font-semibold mb-1.5">Изменения при сборке:</p>
          {removedItems.map((i: any) => (
            <p key={i.id} className="text-gray-700">• {i.product?.name ?? `Товар #${i.id}`}: позиция снята</p>
          ))}
          {changedItems.map((i: any) => (
            <p key={i.id} className="text-gray-700">
              • {i.product?.name ?? `Товар #${i.id}`}: заказано {i.qty_ordered ?? i.qty}, выдано {i.qty_actual}
            </p>
          ))}
        </div>
      )}

      <div className="flex justify-between mt-16 text-sm">
        <div className="w-48 border-t border-gray-800 pt-1 text-xs text-gray-500">Продавец / подпись</div>
        <div className="w-48 border-t border-gray-800 pt-1 text-xs text-gray-500">Покупатель / подпись</div>
      </div>
    </div>
  )
}

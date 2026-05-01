'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import NewOrderModal from './NewOrderModal'

type OrderItem = {
  id: number
  product_id: number
  qty: number
  price: number
  product: { name: string; pack_size: number } | null
}

type Client = { name: string | null; phone: string | null } | null

type Order = {
  id: number
  status: string
  total: number
  notes: string | null
  created_at: string
  client_id: string | null
  guest_phone: string | null
  guest_name: string | null
  client: Client
  order_items: OrderItem[]
  reservations: { expires_at: string }[]
}

export default function OrdersPanel() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewOrder, setShowNewOrder] = useState(false)
  const supabase = createClient()

  async function loadOrders() {
    setLoading(true)
    const { data, error } = await supabase
      .from('orders')
      .select(`id, status, total, notes, created_at, client_id, guest_phone, guest_name, client:client_id(name, phone), order_items(id, product_id, qty, price, product:product_id(name, pack_size)), reservations(expires_at)`)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) console.error('Orders error:', error)
    setOrders((data as any) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadOrders()

    const channel = supabase
      .channel('admin-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        loadOrders()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  async function updateStatus(orderId: number, status: string) {
    if (status === 'confirmed') {
      await fetch('/api/confirm-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId })
      })
    } else {
      await supabase.from('orders').update({ status }).eq('id', orderId)
    }
    
    loadOrders()
  }

  async function updateQty(itemId: number, qty: number) {
    await supabase.from('order_items').update({ qty }).eq('id', itemId)
    loadOrders()
  }

  const statusLabel: Record<string, string> = {
    pending: '⏳ Новый',
    reserved: '🔒 В брони',
    confirmed: '✅ Подтверждён',
    cancelled: '❌ Отменён',
    delivered: '📦 Выдан',
  }

  const statusColor: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    reserved: 'bg-purple-100 text-purple-800',
    confirmed: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800',
    delivered: 'bg-blue-100 text-blue-800',
  }

  const fmt = (n: number) => n?.toLocaleString('ru-RU') + ' T'

  function minExpiresAt(reservations: { expires_at: string }[]): string | null {
    if (!reservations?.length) return null
    return reservations.reduce((min, r) => r.expires_at < min ? r.expires_at : min, reservations[0].expires_at)
  }

  if (loading) return <div className="text-sm text-gray-400 py-4">Загрузка...</div>

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-medium text-gray-600">Заказы</span>
        <button
          onClick={() => setShowNewOrder(true)}
          className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700">
          + Новый заказ
        </button>
      </div>
      {showNewOrder && (
        <NewOrderModal
          onClose={() => setShowNewOrder(false)}
          onCreated={() => { setShowNewOrder(false); loadOrders() }}
        />
      )}
      {orders.length === 0 && <div className="text-sm text-gray-400 py-4">Заказов нет</div>}
      {orders.map(order => {
        const expiresAt = (order.status === 'pending' || order.status === 'reserved') ? minExpiresAt(order.reservations ?? []) : null

        return (
        <div key={order.id} className="border rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <span className="font-medium text-sm">Заказ #{order.id}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[order.status] ?? 'bg-gray-100'}`}>
                  {statusLabel[order.status] ?? order.status}
                </span>
                <span className="text-xs text-gray-400">
                  {new Date(order.created_at).toLocaleString('ru-RU', { timeZone: 'Asia/Oral' })}
                </span>
              </div>
              {expiresAt && (
                <span className="text-xs text-orange-600 font-medium ml-0">
                  🕐 Бронь до: {new Date(expiresAt).toLocaleString('ru-RU', { timeZone: 'Asia/Oral' })}
                </span>
              )}
            </div>
            <span className="text-sm font-medium">{fmt(order.total)}</span>
          </div>

          {(() => {
            const clientName = order.client?.name ?? order.guest_name
            const clientPhone = order.client?.phone ?? order.guest_phone
            if (!clientName && !clientPhone) return null
            return (
              <div className="text-xs text-gray-600 flex gap-3">
                {clientName && <span>👤 {clientName}</span>}
                {clientPhone && <span>📞 {clientPhone}</span>}
              </div>
            )
          })()}

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-gray-400">
                <th className="text-left py-1">Товар</th>
                <th className="text-center py-1 w-24">Кол-во</th>
                <th className="text-right py-1 w-24">Цена</th>
                <th className="text-right py-1 w-24">Сумма</th>
              </tr>
            </thead>
            <tbody>
              {order.order_items.map(item => (
                <tr key={item.id} className="border-b last:border-0">
                  <td className="py-1.5">{item.product?.name ?? `Товар #${item.product_id}`}</td>
                  <td className="py-1.5 text-center">
                    {order.status === 'pending' || order.status === 'reserved' ? (
                      <input
                        type="number"
                        defaultValue={item.qty}
                        onBlur={e => updateQty(item.id, parseInt(e.target.value))}
                        className="w-20 text-center border rounded px-1 py-0.5 text-sm"
                        min={item.product?.pack_size ?? 1}
                        step={item.product?.pack_size ?? 1}
                      />
                    ) : (
                      <span>{item.qty}</span>
                    )}
                  </td>
                  <td className="py-1.5 text-right">{fmt(item.price)}</td>
                  <td className="py-1.5 text-right font-medium">{fmt(item.qty * item.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {order.notes && (
            <div className="text-xs text-gray-500 bg-gray-50 rounded p-2">{order.notes}</div>
          )}

          <div className="flex gap-2 pt-1 flex-wrap">
            {order.status === 'pending' && (
              <>
                <button onClick={() => updateStatus(order.id, 'reserved')}
                  className="px-3 py-1.5 bg-purple-600 text-white text-sm rounded hover:bg-purple-700">
                  🔒 Взять в работу
                </button>
                <button onClick={() => updateStatus(order.id, 'cancelled')}
                  className="px-3 py-1.5 bg-red-100 text-red-700 text-sm rounded hover:bg-red-200">
                  ❌ Отменить
                </button>
              </>
            )}
            {order.status === 'reserved' && (
              <>
                <button onClick={() => updateStatus(order.id, 'confirmed')}
                  className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700">
                  ✅ Подтвердить
                </button>
                <button onClick={() => updateStatus(order.id, 'cancelled')}
                  className="px-3 py-1.5 bg-red-100 text-red-700 text-sm rounded hover:bg-red-200">
                  ❌ Отменить
                </button>
              </>
            )}
            {order.status === 'confirmed' && (
              <button onClick={() => updateStatus(order.id, 'delivered')}
                className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700">
                📦 Выдан
              </button>
            )}
            <button
              onClick={() => window.open(`/print/order/${order.id}`, '_blank', 'width=800,height=700')}
              className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm rounded hover:bg-gray-200 ml-auto">
              🖨 Печать
            </button>
          </div>
        </div>
        )
      })}
    </div>
  )
}


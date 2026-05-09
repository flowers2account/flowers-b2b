'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/lib/auth-store'
import Link from 'next/link'

type OrderItem = {
  id: number
  product_id: number
  qty: number
  price: number
  product: { name: string; pack_size: number; stock: { available_qty: number } | null } | null
}

type Order = {
  id: number
  status: string
  total: number
  notes: string | null
  created_at: string
  client_id: string | null
  order_items: OrderItem[]
  reservations: { expires_at: string }[]
}

type CampaignOrder = {
  id: number
  campaign_id: number
  campaign_title: string | null
  campaign_type: string | null
  delivery_date: string | null
  status: string
  total: number
  items_count: number
  created_at: string
}

const campaignStatusLabel: Record<string, string> = {
  pending: 'Ожидает поставки',
  confirmed: 'Подтверждён',
  delivered: 'Доставлен',
  cancelled: 'Отменён',
}

const campaignStatusColor: Record<string, string> = {
  pending: 'bg-blue-100 text-blue-800',
  confirmed: 'bg-green-100 text-green-800',
  delivered: 'bg-gray-100 text-gray-700',
  cancelled: 'bg-red-100 text-red-800',
}

const TYPE_LABELS: Record<string, string> = { europe: 'Европа', china: 'Китай' }

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

function fmt(n: number) {
  return n?.toLocaleString('ru-RU') + ' ₸'
}

function minExpiresAt(reservations: { expires_at: string }[]): string | null {
  if (!reservations.length) return null
  return reservations.reduce((min, r) => r.expires_at < min ? r.expires_at : min, reservations[0].expires_at)
}

export default function OrdersPageClient() {
  const [orders, setOrders] = useState<Order[]>([])
  const [campaignOrders, setCampaignOrders] = useState<CampaignOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [editingItem, setEditingItem] = useState<number | null>(null)
  const supabase = createClient()
  const { user } = useAuthStore()

  async function loadOrders() {
    setLoading(true)
    const [ordersRes, campaignRes] = await Promise.all([
      fetch('/api/my-orders'),
      user ? fetch(`/api/campaigns/orders?client_id=${user.id}`) : Promise.resolve(null),
    ])
    if (ordersRes.ok) setOrders(await ordersRes.json())
    if (campaignRes?.ok) {
      const d = await campaignRes.json()
      // сортируем: pending первыми, потом по дате поставки
      const list: CampaignOrder[] = d.orders ?? []
      list.sort((a, b) => {
        if (a.status === 'pending' && b.status !== 'pending') return -1
        if (b.status === 'pending' && a.status !== 'pending') return 1
        return new Date(a.delivery_date ?? 0).getTime() - new Date(b.delivery_date ?? 0).getTime()
      })
      setCampaignOrders(list)
    }
    setLoading(false)
  }

  useEffect(() => {
    loadOrders()
    const channel = supabase
      .channel('client-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => loadOrders())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  function toggleExpand(orderId: number) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(orderId)) next.delete(orderId)
      else next.add(orderId)
      return next
    })
  }

  async function cancelOrder(orderId: number) {
    if (!confirm('Отменить заказ?')) return
    await fetch('/api/cancel-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: orderId }),
    })
    loadOrders()
  }

  async function updateQty(itemId: number, rawValue: number, packSize: number, currentQty: number, availableQty: number) {
    const maxQty = currentQty + availableQty
    const clamped = Math.min(rawValue, maxQty)
    const rounded = Math.max(packSize, Math.round(clamped / packSize) * packSize)
    await fetch('/api/update-order-qty', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: itemId, qty: rounded }),
    })
    loadOrders()
    return rounded
  }

  if (loading) return <div className="text-sm text-gray-400 py-8 text-center">Загрузка...</div>

  if (orders.length === 0 && campaignOrders.length === 0) return (
    <div className="text-center py-16">
      <p className="text-gray-400 mb-4">У вас пока нет заказов</p>
      <Link href="/" className="text-green-700 hover:underline text-sm">Перейти в каталог →</Link>
    </div>
  )

  return (
    <div className="space-y-3">
      {/* Предзаказы */}
      {campaignOrders.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide pt-2">📅 Предзаказы</h2>
          {campaignOrders.map(co => {
            const delivery = co.delivery_date
              ? new Date(co.delivery_date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
              : null
            return (
              <div key={co.id} className="border rounded-lg overflow-hidden bg-white">
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3 flex-wrap min-w-0">
                    <span className="font-medium text-sm truncate">
                      📅 {co.campaign_title ?? `Предзаказ #${co.id}`}
                    </span>
                    {co.campaign_type && (
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full shrink-0">
                        {TYPE_LABELS[co.campaign_type] ?? co.campaign_type}
                      </span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${campaignStatusColor[co.status] ?? 'bg-gray-100'}`}>
                      {campaignStatusLabel[co.status] ?? co.status}
                    </span>
                    {delivery && (
                      <span className="text-xs text-gray-400 shrink-0">Поставка: {delivery}</span>
                    )}
                    <span className="text-xs text-gray-400 shrink-0">{co.items_count} поз.</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-semibold">{fmt(co.total)}</span>
                    <Link
                      href={`/campaigns/${co.campaign_id}`}
                      className="text-xs px-2.5 py-1 rounded no-underline font-medium transition-colors"
                      style={{ backgroundColor: '#f5f0f3', color: '#7a1c2e' }}
                    >
                      Открыть
                    </Link>
                  </div>
                </div>
              </div>
            )
          })}
          {orders.length > 0 && (
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide pt-2">Обычные заказы</h2>
          )}
        </>
      )}

      {orders.map(order => {
        const isOpen = expanded.has(order.id)
        const canEdit = order.status === 'pending' || order.status === 'reserved'
        const expiresAt = canEdit ? minExpiresAt(order.reservations ?? []) : null

        return (
          <div key={order.id} className="border rounded-lg overflow-hidden bg-white">
            <button
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 text-left"
              onClick={() => toggleExpand(order.id)}
            >
              <div className="flex items-center gap-3 flex-wrap">
                <span className="font-medium text-sm">Заказ #{order.id}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[order.status] ?? 'bg-gray-100'}`}>
                  {statusLabel[order.status] ?? order.status}
                </span>
                <span className="text-xs text-gray-400">
                  {new Date(order.created_at).toLocaleString('ru-RU', { timeZone: 'Asia/Oral' })}
                </span>
                {expiresAt && (
                  <span className="text-xs text-orange-600 font-medium">
                    🕐 Бронь до: {new Date(expiresAt).toLocaleString('ru-RU', { timeZone: 'Asia/Oral' })}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-sm font-semibold">{fmt(order.total)}</span>
                <span className="text-gray-400 text-xs">{isOpen ? '▲' : '▼'}</span>
              </div>
            </button>

            {isOpen && (
              <div className="border-t px-4 py-3 space-y-3 bg-gray-50">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-gray-400">
                      <th className="text-left py-1">Товар</th>
                      <th className="text-center py-1 w-28">Кол-во</th>
                      <th className="text-right py-1 w-24">Цена</th>
                      <th className="text-right py-1 w-24">Сумма</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.order_items.map(item => {
                      const availableQty = item.product?.stock?.available_qty ?? 0
                      const maxQty = item.qty + availableQty

                      return (
                        <tr key={item.id} className="border-b last:border-0">
                          <td className="py-1.5">{item.product?.name ?? `Товар #${item.product_id}`}</td>
                          <td className="py-1.5 text-center">
                            {canEdit ? (
                              <div className="flex items-center gap-1 justify-center">
                                <input
                                  type="number"
                                  defaultValue={item.qty}
                                  max={maxQty}
                                  id={`qty-${item.id}`}
                                  className="w-20 text-center border rounded px-1 py-0.5 text-sm bg-white"
                                  min={item.product?.pack_size ?? 1}
                                  step={item.product?.pack_size ?? 1}
                                />
                                <button
                                  onClick={async () => {
                                    const input = document.getElementById(`qty-${item.id}`) as HTMLInputElement
                                    const v = parseInt(input.value) || 0
                                    const ps = item.product?.pack_size ?? 1
                                    await updateQty(item.id, v, ps, item.qty, availableQty)
                                    setEditingItem(null)
                                  }}
                                  className="px-2 py-0.5 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                                >
                                  ✓
                                </button>
                              </div>
                            ) : (
                              <span>{item.qty}</span>
                            )}
                          </td>
                          <td className="py-1.5 text-right">{fmt(item.price)}</td>
                          <td className="py-1.5 text-right font-medium">{fmt(item.qty * item.price)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>

                {order.notes && (
                  <div className="text-xs text-gray-500 bg-white rounded p-2 border">{order.notes}</div>
                )}

                <div className="flex gap-2 pt-1 flex-wrap">
                  {canEdit && (
                    <>
                      <Link
                        href="/"
                        className="px-3 py-1.5 bg-green-700 text-white text-sm rounded hover:bg-green-800"
                      >
                        + Добавить товары
                      </Link>
                      <button
                        onClick={() => cancelOrder(order.id)}
                        className="px-3 py-1.5 bg-red-100 text-red-700 text-sm rounded hover:bg-red-200"
                      >
                        ❌ Отменить заказ
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => window.open(`/print/order/${order.id}`, '_blank', 'width=800,height=700')}
                    className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm rounded hover:bg-gray-200"
                  >
                    🖨 Печать
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

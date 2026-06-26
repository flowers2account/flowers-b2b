'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/lib/auth-store'
import { authHeaders } from '@/lib/api-token'
import NewOrderModal from './NewOrderModal'
import AssemblyModal from './AssemblyModal'
import OrderEditModal from './OrderEditModal'
import AdminInvoiceButton from './AdminInvoiceButton'

type HistoryEntry = {
  id: number
  status_from: string | null
  status_to: string
  changed_by: string | null
  manager_name: string | null
  note: string | null
  created_at: string
}

type OrderItem = {
  id: number
  product_id: number
  qty: number
  qty_ordered: number
  qty_actual: number | null
  is_removed: boolean
  price: number
  product: { name: string; pack_size: number } | null
}

type Client = { name: string | null; phone: string | null; company_name: string | null; bin: string | null } | null

type Order = {
  id: number
  status: string
  total: number
  notes: string | null
  created_at: string
  client_id: string | null
  guest_phone: string | null
  guest_name: string | null
  assembly_photo_url: string | null
  client: Client
  order_items: OrderItem[]
  reservations: { expires_at: string }[]
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Новый',
  reserved: 'В работе',
  confirmed: 'Подтверждён',
  assembling: 'Собирается',
  assembled: 'Готов к выдаче',
  delivered: 'Выдан',
  cancelled: 'Отменён',
}

type DatePreset = '' | 'today' | 'yesterday' | 'last7' | 'last30' | 'custom'

const DATE_PRESETS: { id: DatePreset; label: string }[] = [
  { id: 'today',     label: 'Сегодня'  },
  { id: 'yesterday', label: 'Вчера'    },
  { id: 'last7',     label: '7 дней'   },
  { id: 'last30',    label: '30 дней'  },
  { id: 'custom',    label: 'Период'   },
]

const ALL_STATUSES = ['pending', 'reserved', 'confirmed', 'assembling', 'assembled', 'delivered', 'cancelled']

export default function OrdersPanel() {
  const { user } = useAuthStore()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewOrder, setShowNewOrder] = useState(false)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [assemblyOrder, setAssemblyOrder] = useState<Order | null>(null)
  const [updatingOrderId, setUpdatingOrderId] = useState<number | null>(null)
  const [statusError, setStatusError] = useState<{ orderId: number; message: string } | null>(null)
  const [editingOrder, setEditingOrder] = useState<Order | null>(null)
  const [repeatOrder, setRepeatOrder] = useState<Order | null>(null)

  // Filters
  const [datePreset, setDatePreset] = useState<DatePreset>('')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([])

  const hasFilters = datePreset !== '' || selectedStatuses.length > 0

  function toggleStatus(s: string) {
    setSelectedStatuses(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  }

  function resetFilters() {
    setDatePreset('')
    setCustomFrom('')
    setCustomTo('')
    setSelectedStatuses([])
  }

  const filteredOrders = useMemo(() => {
    let result = orders

    if (datePreset) {
      const now = new Date()
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      let fromDate: Date | null = null
      let toDate: Date | null = null

      if (datePreset === 'today')     { fromDate = todayStart }
      if (datePreset === 'yesterday') { fromDate = new Date(todayStart.getTime() - 86_400_000); toDate = todayStart }
      if (datePreset === 'last7')     { fromDate = new Date(todayStart.getTime() - 6 * 86_400_000) }
      if (datePreset === 'last30')    { fromDate = new Date(todayStart.getTime() - 29 * 86_400_000) }
      if (datePreset === 'custom') {
        if (customFrom) fromDate = new Date(customFrom)
        if (customTo)   toDate   = new Date(customTo + 'T23:59:59')
      }

      if (fromDate) result = result.filter(o => new Date(o.created_at) >= fromDate!)
      if (toDate)   result = result.filter(o => new Date(o.created_at) <= toDate!)
    }

    if (selectedStatuses.length > 0) {
      result = result.filter(o => selectedStatuses.includes(o.status))
    }

    return result
  }, [orders, datePreset, customFrom, customTo, selectedStatuses])

  async function handleExport() {
    const params = new URLSearchParams()
    const now = new Date()
    const todayStr = now.toISOString().split('T')[0]
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const d = (ms: number) => new Date(todayStart.getTime() - ms).toISOString().split('T')[0]

    if (datePreset === 'today')     { params.set('from', todayStr);              params.set('to', todayStr) }
    else if (datePreset === 'yesterday') { const y = d(86_400_000); params.set('from', y); params.set('to', y) }
    else if (datePreset === 'last7')  { params.set('from', d(6 * 86_400_000));   params.set('to', todayStr) }
    else if (datePreset === 'last30') { params.set('from', d(29 * 86_400_000));  params.set('to', todayStr) }
    else if (datePreset === 'custom') { if (customFrom) params.set('from', customFrom); if (customTo) params.set('to', customTo) }
    // no preset → endpoint uses last-30-days default

    if (selectedStatuses.length > 0) params.set('status', selectedStatuses.join(','))

    // Экспорт закрыт под роль admin/manager → шлём токен в заголовке (window.open его не несёт)
    try {
      const res = await fetch(`/api/export-orders?${params.toString()}`, { headers: await authHeaders() })
      if (!res.ok) { alert(res.status === 403 ? 'Нет прав на экспорт' : 'Не удалось выгрузить'); return }
      const blob = await res.blob()
      const cd = res.headers.get('content-disposition') || ''
      const m = cd.match(/filename="?([^"]+)"?/)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = m?.[1] || `orders-${todayStr}.xlsx`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
    } catch { alert('Ошибка сети при экспорте') }
  }
  const supabase = createClient()

  async function loadOrders() {
    setLoading(true)
    const { data, error } = await supabase
      .from('orders')
      .select(`id, status, total, notes, created_at, client_id, guest_phone, guest_name, assembly_photo_url, client:client_id(name, phone, company_name, bin), order_items(id, product_id, qty, qty_ordered, qty_actual, is_removed, price, product:product_id(name, pack_size)), reservations(expires_at)`)
      .order('created_at', { ascending: false })
      .limit(200)
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

  const [paymentData, setPaymentData] = useState<Record<number, { method: string; comment: string }>>({})

  function getPayment(orderId: number) {
    return paymentData[orderId] ?? { method: '', comment: '' }
  }

  function setPayment(orderId: number, field: 'method' | 'comment', value: string) {
    setPaymentData(prev => ({ ...prev, [orderId]: { ...getPayment(orderId), [field]: value } }))
  }

  async function updateStatus(orderId: number, status: string, extra?: { payment_method?: string; payment_comment?: string }) {
    if (updatingOrderId === orderId) return
    setUpdatingOrderId(orderId)
    setStatusError(null)
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, changed_by: user?.id ?? null, ...extra }),
      })
      if (!res.ok) {
        const data = await res.json()
        setStatusError({ orderId, message: data.error ?? 'Ошибка при смене статуса' })
        return
      }
      if (expandedId === orderId) await loadHistory(orderId)
      await loadOrders()
    } finally {
      setUpdatingOrderId(null)
    }
  }

  async function loadHistory(orderId: number) {
    const res = await fetch(`/api/orders/${orderId}/history`)
    const data = await res.json()
    setHistory(Array.isArray(data) ? data : [])
  }

  async function toggleExpanded(orderId: number) {
    if (expandedId === orderId) {
      setExpandedId(null)
      setHistory([])
      return
    }
    setExpandedId(orderId)
    await loadHistory(orderId)
  }

  async function updateQty(itemId: number, qty: number) {
    await supabase.from('order_items').update({ qty }).eq('id', itemId)
    loadOrders()
  }

  async function deleteOrder(orderId: number) {
    if (!window.confirm(`Удалить заказ #${orderId}? Это действие нельзя отменить.`)) return
    await supabase.from('reservations').delete().eq('order_id', orderId)
    await supabase.from('order_history').delete().eq('order_id', orderId)
    await supabase.from('order_items').delete().eq('order_id', orderId)
    await supabase.from('orders').delete().eq('id', orderId)
    loadOrders()
  }

  const statusLabel: Record<string, string> = {
    pending: '⏳ Новый',
    reserved: '🔒 В брони',
    confirmed: '✅ Подтверждён',
    assembling: '🔧 В сборке',
    assembled: '📦 Готово к выдаче',
    cancelled: '❌ Отменён',
    delivered: '🚚 Выдан',
  }

  const statusColor: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    reserved: 'bg-purple-100 text-purple-800',
    confirmed: 'bg-green-100 text-green-800',
    assembling: 'bg-orange-100 text-orange-800',
    assembled: 'bg-teal-100 text-teal-800',
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
      {/* Header row */}
      <div className="flex justify-between items-center">
        <span className="text-sm font-medium text-gray-600">Заказы</span>
        <button
          onClick={() => setShowNewOrder(true)}
          className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700">
          + Новый заказ
        </button>
      </div>

      {/* Filter bar */}
      <div className="space-y-3 px-4 py-3 bg-gray-50 rounded-lg border border-gray-200">
        {/* Date presets */}
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-14 shrink-0">Период</span>
          {DATE_PRESETS.map(p => (
            <button
              key={p.id}
              onClick={() => setDatePreset(prev => prev === p.id ? '' : p.id)}
              className="px-2.5 py-1 text-xs font-medium rounded-full border transition-all"
              style={{
                background:   datePreset === p.id ? '#7a1c2e' : '#fff',
                color:        datePreset === p.id ? '#fff' : '#555',
                borderColor:  datePreset === p.id ? '#7a1c2e' : '#e5e7eb',
              }}
            >{p.label}</button>
          ))}
          {datePreset === 'custom' && (
            <div className="flex items-center gap-1.5 mt-1 w-full pl-[72px]">
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                className="border rounded px-2 py-1 text-xs" />
              <span className="text-gray-400 text-xs">—</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                className="border rounded px-2 py-1 text-xs" />
            </div>
          )}
        </div>

        {/* Status checkboxes */}
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-14 shrink-0">Статус</span>
          {ALL_STATUSES.map(s => {
            const active = selectedStatuses.includes(s)
            return (
              <button
                key={s}
                onClick={() => toggleStatus(s)}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full border transition-all"
                style={{
                  background:  active ? '#7a1c2e' : '#fff',
                  color:       active ? '#fff' : '#555',
                  borderColor: active ? '#7a1c2e' : '#e5e7eb',
                }}
              >
                <span
                  className="w-3 h-3 rounded border flex-shrink-0 flex items-center justify-center"
                  style={{
                    borderColor: active ? 'rgba(255,255,255,0.6)' : '#ccc',
                    background:  active ? 'rgba(255,255,255,0.15)' : '#fff',
                    fontSize: 8, color: '#fff',
                  }}
                >{active ? '✓' : ''}</span>
                {statusLabel[s] ?? s}
              </button>
            )
          })}
        </div>

        {/* Counter + reset + export */}
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <span className="text-xs text-gray-500">
            Показано <span className="font-semibold text-gray-700">{filteredOrders.length}</span> из{' '}
            <span className="font-semibold text-gray-700">{orders.length}</span> заказов
          </span>
          <div className="flex items-center gap-2 shrink-0">
            {hasFilters && (
              <button onClick={resetFilters} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
                Сбросить
              </button>
            )}
            <button
              onClick={handleExport}
              className="px-3 py-1 text-xs font-medium bg-green-700 text-white rounded hover:bg-green-800 transition-colors"
            >
              📥 Excel
            </button>
          </div>
        </div>
      </div>
      {showNewOrder && (
        <NewOrderModal
          onClose={() => setShowNewOrder(false)}
          onCreated={() => { setShowNewOrder(false); loadOrders() }}
        />
      )}
      {repeatOrder && (
        <NewOrderModal
          onClose={() => setRepeatOrder(null)}
          onCreated={() => { setRepeatOrder(null); loadOrders() }}
          initialClient={repeatOrder.client_id && repeatOrder.client
            ? { id: repeatOrder.client_id, name: repeatOrder.client.name, phone: repeatOrder.client.phone }
            : undefined}
          initialItems={repeatOrder.order_items
            .filter(i => !i.is_removed)
            .map(i => ({
              id: i.product_id,
              name: i.product?.name ?? `Товар #${i.product_id}`,
              price: i.price,
              pack_size: i.product?.pack_size ?? 1,
              available_qty: 0,
              qty: i.qty,
            }))}
        />
      )}
      {assemblyOrder && (
        <AssemblyModal
          orderId={assemblyOrder.id}
          items={assemblyOrder.order_items.map(i => ({
            id: i.id,
            product_id: i.product_id,
            qty_ordered: i.qty_ordered ?? i.qty,
            qty_actual: i.qty_actual,
            is_removed: i.is_removed ?? false,
            price: i.price,
            product: i.product,
          }))}
          onClose={() => setAssemblyOrder(null)}
          onSaved={() => { setAssemblyOrder(null); loadOrders() }}
        />
      )}
      {editingOrder && (
        <OrderEditModal
          orderId={editingOrder.id}
          initialItems={editingOrder.order_items
            .filter(i => !i.is_removed)
            .map(i => ({
              id: i.id,
              product_id: i.product_id,
              name: i.product?.name ?? `Товар #${i.product_id}`,
              qty: i.qty,
              price: i.price,
              pack_size: i.product?.pack_size ?? 1,
            }))}
          onClose={() => setEditingOrder(null)}
          onSaved={() => { setEditingOrder(null); loadOrders() }}
        />
      )}
      {filteredOrders.length === 0 && (
        <div className="text-sm text-gray-400 py-4">
          {orders.length === 0 ? 'Заказов нет' : 'Нет заказов, соответствующих фильтрам'}
        </div>
      )}
      {filteredOrders.map(order => {
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
            const companyName = (order.client as any)?.company_name
            if (!clientName && !clientPhone) return null
            const displayName = companyName && clientName
              ? `${companyName} / ${clientName}`
              : companyName || clientName
            return (
              <div className="text-xs text-gray-600 flex gap-3">
                {displayName && <span>👤 {displayName}</span>}
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

          {order.client?.company_name && (
            <div className="pt-1">
              <AdminInvoiceButton orderId={order.id} />
            </div>
          )}

          {order.assembly_photo_url && (order.status === 'assembled' || order.status === 'delivered') && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">📷 Фото сборки:</span>
              <a href={order.assembly_photo_url} target="_blank" rel="noopener noreferrer">
                <img
                  src={order.assembly_photo_url}
                  alt="Фото сборки"
                  style={{ width: 120, height: 90, objectFit: 'cover' }}
                  className="rounded border hover:opacity-90 transition-opacity cursor-pointer"
                />
              </a>
            </div>
          )}

          {order.notes && (
            <div className="text-xs text-gray-500 bg-gray-50 rounded p-2">{order.notes}</div>
          )}

          <div className="flex gap-2 pt-1 flex-wrap">
            {order.status === 'pending' && (
              <>
                <button onClick={() => updateStatus(order.id, 'reserved')}
                  disabled={updatingOrderId === order.id}
                  className="px-3 py-1.5 bg-purple-600 text-white text-sm rounded hover:bg-purple-700 disabled:opacity-50">
                  🔒 Поставить в бронь
                </button>
                <button onClick={() => updateStatus(order.id, 'cancelled')}
                  disabled={updatingOrderId === order.id}
                  className="px-3 py-1.5 bg-red-100 text-red-700 text-sm rounded hover:bg-red-200 disabled:opacity-50">
                  ❌ Отменить
                </button>
              </>
            )}
            {order.status === 'reserved' && (
              <>
                <button onClick={() => updateStatus(order.id, 'confirmed')}
                  disabled={updatingOrderId === order.id}
                  className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50">
                  {updatingOrderId === order.id ? 'Обработка...' : '✅ Подтвердить'}
                </button>
                <button onClick={() => updateStatus(order.id, 'cancelled')}
                  disabled={updatingOrderId === order.id}
                  className="px-3 py-1.5 bg-red-100 text-red-700 text-sm rounded hover:bg-red-200 disabled:opacity-50">
                  ❌ Отменить
                </button>
              </>
            )}
            {order.status === 'confirmed' && (
              <button
                onClick={async () => {
                  await updateStatus(order.id, 'assembling')
                  setAssemblyOrder(order)
                }}
                disabled={updatingOrderId === order.id}
                className="px-3 py-1.5 bg-orange-500 text-white text-sm rounded hover:bg-orange-600 disabled:opacity-50">
                🔧 Начать сборку
              </button>
            )}
            {order.status === 'assembling' && (
              <button
                onClick={() => setAssemblyOrder(order)}
                className="px-3 py-1.5 bg-orange-500 text-white text-sm rounded hover:bg-orange-600">
                🔧 Продолжить сборку
              </button>
            )}
            {order.status === 'assembled' && (() => {
              const pm = getPayment(order.id)
              const METHODS = [
                { id: 'cash',     label: '💵 Наличные' },
                { id: 'halyk_qr', label: '📱 Halyk QR' },
                { id: 'other',    label: '💳 Прочее' },
              ]
              return (
                <div className="w-full space-y-2 mt-1 mb-1">
                  <div className="text-xs text-gray-600">Способ оплаты:</div>
                  <div className="flex gap-4">
                    {METHODS.map(m => (
                      <label key={m.id} className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={pm.method === m.id}
                          onChange={() => setPayment(order.id, 'method', m.id)}
                          className="w-4 h-4"
                        />
                        <span className="text-sm">{m.label}</span>
                      </label>
                    ))}
                  </div>
                  <textarea
                    value={pm.comment}
                    onChange={e => setPayment(order.id, 'comment', e.target.value)}
                    placeholder="Комментарий (необязательно)..."
                    className="w-full border rounded px-2 py-1 text-sm resize-none"
                    rows={2}
                  />
                  <button
                    onClick={async () => {
                      await updateStatus(order.id, 'delivered', {
                        payment_method: pm.method || undefined,
                        payment_comment: pm.comment || undefined,
                      })
                      window.open(`/print/order/${order.id}`, '_blank')
                    }}
                    disabled={updatingOrderId === order.id}
                    className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50">
                    ✅ Выдать
                  </button>
                </div>
              )
            })()}
            <button
              onClick={() => toggleExpanded(order.id)}
              className="px-3 py-1.5 bg-gray-50 text-gray-500 text-sm rounded hover:bg-gray-100 border">
              {expandedId === order.id ? '▲ История' : '▼ История'}
            </button>
            {!['delivered', 'cancelled'].includes(order.status) && (
              <button
                onClick={() => setEditingOrder(order)}
                className="px-3 py-1.5 bg-gray-50 text-gray-600 text-sm rounded hover:bg-gray-100 border">
                ✏️ Редактировать
              </button>
            )}
            <button
              onClick={() => setRepeatOrder(order)}
              className="px-3 py-1.5 bg-gray-50 text-gray-600 text-sm rounded hover:bg-gray-100 border">
              🔁 Повторить
            </button>
            <button
              onClick={() => window.open(`/print/order/${order.id}`, '_blank', 'width=800,height=700')}
              className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm rounded hover:bg-gray-200 ml-auto">
              🖨 Печать
            </button>
            <button
              onClick={() => deleteOrder(order.id)}
              className="px-3 py-1.5 bg-red-50 text-red-500 text-sm rounded hover:bg-red-100 border border-red-200">
              🗑
            </button>
          </div>

          {statusError?.orderId === order.id && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
              ⚠️ {statusError.message}
            </div>
          )}

          {expandedId === order.id && (
            <div style={{ borderTop: '0.5px solid var(--border)', marginTop: 8, paddingTop: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--text-mid)', marginBottom: 4, fontWeight: 500 }}>
                История
              </div>
              {!history.length ? (
                <div style={{ fontSize: 11, color: 'var(--text-mid)' }}>Нет записей</div>
              ) : (
                history.map(h => (
                  <div key={h.id} style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', gap: 8, padding: '2px 0' }}>
                    <span style={{ color: 'var(--text-tertiary)', flexShrink: 0 }}>
                      {new Date(h.created_at).toLocaleString('ru-RU', {
                        day: '2-digit', month: '2-digit',
                        hour: '2-digit', minute: '2-digit',
                        timeZone: 'Asia/Oral',
                      })}
                    </span>
                    <span>
                      {STATUS_LABELS[h.status_from ?? ''] ?? h.status_from ?? '—'}
                      {' → '}
                      {STATUS_LABELS[h.status_to] ?? h.status_to}
                      {h.manager_name && (
                        <span style={{ color: 'var(--text-tertiary)' }}> · {h.manager_name}</span>
                      )}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
        )
      })}
    </div>
  )
}


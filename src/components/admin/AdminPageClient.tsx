'use client'
import { useState } from 'react'
import AdminTable from './AdminTable'
import ImportXLS from './ImportXLS'
import OrdersPanel from './OrdersPanel'
import ClientsPanel from './ClientsPanel'
import StaffPanel from './StaffPanel'
import WriteoffsTab from './WriteoffsTab'
import Link from 'next/link'
import { useSettingsStore } from '@/lib/store/settingsStore'
import OrdersKanban from '@/app/admin/orders/OrdersKanban'
import type { KanbanOrder } from '@/app/admin/orders/OrderCard'

function OrderDetailModal({ order, onClose, onSwitchToTable }: { order: KanbanOrder; onClose: () => void; onSwitchToTable: () => void }) {
  const name        = order.client?.name ?? order.guest_name
  const company     = order.client?.company_name
  const phone       = order.client?.phone ?? order.guest_phone
  const displayName = company && name ? `${company} / ${name}` : company || name
  const items       = order.order_items.filter(i => !i.is_removed)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-sm shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="font-semibold text-gray-800">Заказ #{order.id}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>
        <div className="px-5 py-4 space-y-3 text-sm">
          {displayName && <div><span className="text-gray-500">Клиент: </span>{displayName}</div>}
          {phone && <div><span className="text-gray-500">Телефон: </span>{phone}</div>}
          <div>
            <span className="text-gray-500">Создан: </span>
            {new Date(order.created_at).toLocaleString('ru-RU', { timeZone: 'Asia/Oral' })}
          </div>
          <div><span className="text-gray-500">Позиций: </span>{items.length}</div>
          <div className="text-base font-semibold">{order.total.toLocaleString('ru-RU')} ₸</div>
        </div>
        <div className="px-5 pb-4">
          <button onClick={onSwitchToTable}
            className="block w-full text-center text-xs hover:underline" style={{ color: '#7a1c2e' }}>
            Открыть в таблице →
          </button>
        </div>
      </div>
    </div>
  )
}

type Stock = { price: number; qty: number; qty_reserved: number; is_available: boolean; reserved_qty?: number } | null
type Product = { id: number; name: string; category: string; is_active: boolean; pack_size: number; image_url?: string | null; stock: Stock[] | Stock }

export default function AdminPageClient() {
  const [tab, setTab] = useState('stock')
  const [orderMode, setOrderMode] = useState<'kanban' | 'table'>('table')
  const [detailOrder, setDetailOrder] = useState<KanbanOrder | null>(null)
  const [stockKey, setStockKey] = useState(0)
  const { clientNotificationsEnabled, toggleClientNotifications } = useSettingsStore()

  const handleToggle = async () => {
    toggleClientNotifications()
    await fetch('/api/settings/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !clientNotificationsEnabled })
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b pb-2">
        <button
          onClick={() => setTab('stock')}
          className={`px-4 py-2 text-sm rounded-t font-medium ${tab === 'stock' ? 'bg-white border border-b-white -mb-px text-green-700' : 'text-gray-500 hover:text-gray-700'}`}
        >
          📦 Остатки
        </button>
        <button
          onClick={() => setTab('orders')}
          className={`px-4 py-2 text-sm rounded-t font-medium ${tab === 'orders' ? 'bg-white border border-b-white -mb-px text-green-700' : 'text-gray-500 hover:text-gray-700'}`}
        >
          🛒 Заказы
        </button>
        <Link
          href="/admin/campaigns"
          className="px-4 py-2 text-sm rounded-t font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-50"
        >
          📅 Кампании
        </Link>
        <Link
          href="/admin/preorders"
          className="px-4 py-2 text-sm rounded-t font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-50"
        >
          🌸 Предзаказы
        </Link>
        <Link
          href="/admin/translations/bulk"
          className="px-4 py-2 text-sm rounded-t font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-50"
        >
          🌐 Переводы
        </Link>
        <Link
          href="/admin/generate-cards"
          className="px-4 py-2 text-sm rounded-t font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-50"
        >
          🎨 Карточки
        </Link>
        <Link
          href="/admin/cashier"
          className="px-4 py-2 text-sm rounded-t font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-50 ml-auto"
        >
          🖥️ Касса
        </Link>
      </div>

      {tab === 'stock' && (
        <>
          <ImportXLS onImported={() => setStockKey(k => k + 1)} />
          <AdminTable key={stockKey} />
        </>
      )}
      {tab === 'orders' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Заказы</h2>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="text-sm text-gray-600">Уведомления клиентам</span>
                <input
                  type="checkbox"
                  checked={clientNotificationsEnabled}
                  onChange={handleToggle}
                  className="w-4 h-4 rounded border-gray-300"
                />
              </label>
              <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setOrderMode('table')}
                  className="px-4 py-1.5 text-sm font-medium rounded-md transition-colors"
                  style={orderMode === 'table' ? { backgroundColor: '#7a1c2e', color: '#fff' } : { color: '#555' }}
                >
                  📊 Таблица
                </button>
                <button
                  onClick={() => setOrderMode('kanban')}
                  className="px-4 py-1.5 text-sm font-medium rounded-md transition-colors"
                  style={orderMode === 'kanban' ? { backgroundColor: '#7a1c2e', color: '#fff' } : { color: '#555' }}
                >
                  📌 Канбан
                </button>
              </div>
            </div>
          </div>
          {orderMode === 'kanban'
            ? <OrdersKanban onOrderClick={setDetailOrder} />
            : <OrdersPanel />
          }
          {detailOrder && (
            <OrderDetailModal
              order={detailOrder}
              onClose={() => setDetailOrder(null)}
              onSwitchToTable={() => { setDetailOrder(null); setOrderMode('table') }}
            />
          )}
        </>
      )}
      {tab === 'clients' && <ClientsPanel />}
      {tab === 'staff' && <StaffPanel />}
      {tab === 'writeoffs' && <WriteoffsTab />}
    </div>
  )
}

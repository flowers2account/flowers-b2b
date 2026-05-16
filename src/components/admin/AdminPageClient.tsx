'use client'
import { useState, useEffect } from 'react'
import AdminTable from './AdminTable'
import ImportXLS from './ImportXLS'
import OrdersPanel from './OrdersPanel'
import ClientsPanel from './ClientsPanel'
import StaffPanel from './StaffPanel'
import Link from 'next/link'
import { useSettingsStore } from '@/lib/store/settingsStore'

type Stock = { price: number; qty: number; qty_reserved: number; is_available: boolean; reserved_qty?: number } | null
type Product = { id: number; name: string; category: string; is_active: boolean; pack_size: number; image_url?: string | null; stock: Stock[] | Stock }

export default function AdminPageClient({ initialProducts }: { initialProducts: Product[] }) {
  const [tab, setTab] = useState('orders')
  const [products, setProducts] = useState(initialProducts)
  const { clientNotificationsEnabled, toggleClientNotifications } = useSettingsStore()

  useEffect(() => {
    fetch('/api/settings/notifications')
      .then(r => r.json())
      .then(data => {
        if (data.enabled !== clientNotificationsEnabled) {
          toggleClientNotifications()
        }
      })
      .catch(() => {})
  }, [])

  const handleToggle = async () => {
    toggleClientNotifications()
    await fetch('/api/settings/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !clientNotificationsEnabled })
    })
  }

  async function reload() {
    const res = await fetch('/api/products')
    const data = await res.json()
    if (data) setProducts(data)
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
        <button
          onClick={() => setTab('clients')}
          className={`px-4 py-2 text-sm rounded-t font-medium ${tab === 'clients' ? 'bg-white border border-b-white -mb-px text-green-700' : 'text-gray-500 hover:text-gray-700'}`}
        >
          👥 Клиенты
        </button>
        <button
          onClick={() => setTab('staff')}
          className={`px-4 py-2 text-sm rounded-t font-medium ${tab === 'staff' ? 'bg-white border border-b-white -mb-px text-green-700' : 'text-gray-500 hover:text-gray-700'}`}
        >
          🧑‍💼 Сотрудники
        </button>
        <Link
          href="/admin/campaigns"
          className="px-4 py-2 text-sm rounded-t font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-50"
        >
          📅 Кампании
        </Link>
      </div>

      {tab === 'stock' && (
        <>
          <ImportXLS onImported={reload} />
          <AdminTable products={products} onReload={reload} />
        </>
      )}
      {tab === 'orders' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Заказы</h2>
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-sm text-gray-600">Уведомления клиентам</span>
              <input
                type="checkbox"
                checked={clientNotificationsEnabled}
                onChange={handleToggle}
                className="w-4 h-4 rounded border-gray-300"
              />
            </label>
          </div>
          <OrdersPanel />
        </>
      )}
      {tab === 'clients' && <ClientsPanel />}
      {tab === 'staff' && <StaffPanel />}
    </div>
  )
}

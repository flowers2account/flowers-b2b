'use client'
import { useState } from 'react'
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
  const [filters, setFilters] = useState({
    inStockOnly: true,
    categories: { cut: true, pot: true, supply: true }
  })

  const handleToggle = async () => {
    toggleClientNotifications()
    await fetch('/api/settings/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !clientNotificationsEnabled })
    })
  }

  const filteredProducts = products.filter(product => {
    if (filters.inStockOnly) {
      const stock = Array.isArray(product.stock) ? product.stock[0] : product.stock
      if (!stock || stock.qty <= 0) return false
    }
    const enabledCategories = Object.entries(filters.categories)
      .filter(([, enabled]) => enabled)
      .map(([category]) => category)
    if (enabledCategories.length === 0) return false
    return enabledCategories.includes(product.category)
  })

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
        <Link
          href="/admin/translations/bulk"
          className="px-4 py-2 text-sm rounded-t font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-50"
        >
          🌐 Переводы
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
          <ImportXLS onImported={reload} />
          <div className="flex items-center gap-6 mb-4 p-4 bg-gray-50 rounded-lg">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.inStockOnly}
                onChange={(e) => setFilters(prev => ({ ...prev, inStockOnly: e.target.checked }))}
                className="w-4 h-4 rounded border-gray-300"
              />
              <span className="text-sm font-medium">В наличии</span>
            </label>
            <div className="h-6 w-px bg-gray-300" />
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">Категории:</span>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.categories.cut}
                  onChange={(e) => setFilters(prev => ({ ...prev, categories: { ...prev.categories, cut: e.target.checked } }))}
                  className="w-4 h-4 rounded border-gray-300"
                />
                <span className="text-sm">🌹 Срез</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.categories.pot}
                  onChange={(e) => setFilters(prev => ({ ...prev, categories: { ...prev.categories, pot: e.target.checked } }))}
                  className="w-4 h-4 rounded border-gray-300"
                />
                <span className="text-sm">🪴 Горшок</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.categories.supply}
                  onChange={(e) => setFilters(prev => ({ ...prev, categories: { ...prev.categories, supply: e.target.checked } }))}
                  className="w-4 h-4 rounded border-gray-300"
                />
                <span className="text-sm">📦 Расходка</span>
              </label>
            </div>
          </div>
          <div className="text-sm text-gray-500 mb-2">
            Показано: {filteredProducts.length} из {products.length}
          </div>
          <AdminTable products={filteredProducts} onReload={reload} />
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

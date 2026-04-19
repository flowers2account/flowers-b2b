'use client'
import { useState } from 'react'
import AdminTable from './AdminTable'
import ImportXLS from './ImportXLS'
import OrdersPanel from './OrdersPanel'

type Stock = { price: number; qty: number; qty_reserved: number; is_available: boolean } | null
type Product = { id: number; name: string; category: string; is_active: boolean; pack_size: number; stock: Stock[] | Stock }

export default function AdminPageClient({ initialProducts }: { initialProducts: Product[] }) {
  const [tab, setTab] = useState('stock')
  const [products, setProducts] = useState(initialProducts)

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
      </div>

      {tab === 'stock' && (
        <>
          <ImportXLS onImported={reload} />
          <AdminTable products={products} />
        </>
      )}

      {tab === 'orders' && <OrdersPanel />}
    </div>
  )
}

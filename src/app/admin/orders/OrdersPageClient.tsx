'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/auth-store'
import Link from 'next/link'
import OrdersPanel from '@/components/admin/OrdersPanel'
import OrdersKanban from './OrdersKanban'
import type { KanbanOrder } from './OrderCard'

function OrderDetailModal({ order, onClose }: { order: KanbanOrder; onClose: () => void }) {
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
          <Link href="/admin/orders?mode=table" onClick={onClose}
            className="block text-center text-xs hover:underline" style={{ color: '#7a1c2e' }}>
            Открыть в таблице →
          </Link>
        </div>
      </div>
    </div>
  )
}

interface Props {
  mode: 'table' | 'kanban'
}

export default function OrdersPageClient({ mode }: Props) {
  const router = useRouter()
  const { isAuthed, role, init } = useAuthStore()
  const [detailOrder, setDetailOrder] = useState<KanbanOrder | null>(null)

  useEffect(() => { init() }, [])

  useEffect(() => {
    // Persist mode to localStorage so Header toggle shows correct active state
    if (typeof window !== 'undefined') {
      localStorage.setItem('ordersViewMode', mode)
    }
  }, [mode])

  useEffect(() => {
    if (isAuthed && role !== 'admin' && role !== 'manager') {
      router.replace('/')
    }
  }, [isAuthed, role, router])

  if (!isAuthed) return null

  return (
    <div className="max-w-[1480px] mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-5">
        <Link href="/admin" className="text-sm text-gray-400 hover:text-gray-600">← Админка</Link>
        <h1 className="text-xl font-bold text-gray-800">Заказы</h1>
      </div>

      {mode === 'table'
        ? <OrdersPanel />
        : <OrdersKanban onOrderClick={setDetailOrder} />
      }

      {detailOrder && (
        <OrderDetailModal order={detailOrder} onClose={() => setDetailOrder(null)} />
      )}
    </div>
  )
}

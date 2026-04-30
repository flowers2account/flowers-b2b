'use client'
import { useEffect, useState } from 'react'
import { useAuthStore } from '@/lib/auth-store'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type OrderItem = {
  id: string
  qty: number
  price: number
  product: { name: string } | null
}

type Order = {
  id: string
  status: string
  created_at: string
  order_items: OrderItem[]
}

const STATUS_LABELS: Record<string, string> = {
  pending: '⏳ Новый',
  reserved: '📦 В работе',
  confirmed: '✅ Подтверждён',
  delivered: '🚚 Выдан',
  cancelled: '❌ Отменён',
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  reserved: 'bg-blue-100 text-blue-800',
  confirmed: 'bg-green-100 text-green-800',
  delivered: 'bg-gray-100 text-gray-800',
  cancelled: 'bg-red-100 text-red-800',
}

export default function CabinetPage() {
  const { isAuthed, clientPhone, clientName } = useAuthStore()
  const router = useRouter()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isAuthed || !clientPhone) {
      router.push('/')
      return
    }
    fetch(`/api/cabinet?phone=${encodeURIComponent(clientPhone)}`)
      .then(r => r.json())
      .then(data => {
        setOrders(data.orders ?? [])
        setLoading(false)
      })
  }, [isAuthed, clientPhone, router])

  if (!isAuthed) return null

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Мои заказы</h1>
          <p className="text-sm text-gray-500 mt-1">👤 {clientName} · {clientPhone}</p>
        </div>
        <Link href="/" className="text-sm text-gray-400 hover:text-gray-600">← Каталог</Link>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Загрузка...</div>
      ) : orders.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">🌸</p>
          <p>У вас пока нет заказов</p>
          <Link href="/" className="mt-4 inline-block text-pink-500 hover:underline">Перейти в каталог</Link>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map(order => {
            const total = order.order_items.reduce((s, i) => s + i.qty * i.price, 0)
            const date = new Date(order.created_at).toLocaleString('ru-RU', { timeZone: 'Asia/Oral', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
            return (
              <div key={order.id} className="border rounded-xl p-4 bg-white shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-gray-400">{date}</span>
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${STATUS_COLORS[order.status] ?? 'bg-gray-100'}`}>
                    {STATUS_LABELS[order.status] ?? order.status}
                  </span>
                </div>
                <div className="space-y-1">
                  {order.order_items.map(item => (
                    <div key={item.id} className="flex justify-between text-sm">
                      <span className="text-gray-700">{item.product?.name ?? '—'} × {item.qty}</span>
                      <span className="text-gray-500">{(item.qty * item.price).toLocaleString()} ₸</span>
                    </div>
                  ))}
                </div>
                <div className="border-t mt-3 pt-2 flex justify-between text-sm font-semibold">
                  <span>Итого</span>
                  <span>{total.toLocaleString()} ₸</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
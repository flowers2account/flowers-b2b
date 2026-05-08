'use client'
import { useEffect, useState } from 'react'
import { useAuthStore } from '@/lib/auth-store'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type OrderItem = {
  id: string
  qty: number
  qty_ordered: number
  qty_actual: number | null
  is_removed: boolean
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
  pending: '⏳ Обрабатывается',
  reserved: '⏳ Обрабатывается',
  confirmed: '✅ Подтверждён',
  assembling: '🔧 Собирается на складе',
  assembled: '📦 Готов к выдаче!',
  delivered: '✅ Выдан',
  cancelled: '❌ Отменён',
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  reserved: 'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-green-100 text-green-800',
  assembling: 'bg-orange-100 text-orange-800',
  assembled: 'bg-teal-100 text-teal-900 font-bold',
  delivered: 'bg-gray-100 text-gray-800',
  cancelled: 'bg-red-100 text-red-800',
}

const STEP_ORDER = ['pending', 'confirmed', 'assembling', 'assembled', 'delivered']

const TIMELINE_STEPS = [
  { key: 'pending', label: 'Создан' },
  { key: 'confirmed', label: 'Подтверждён' },
  { key: 'assembling', label: 'Собирается' },
  { key: 'assembled', label: 'Готов' },
  { key: 'delivered', label: 'Выдан' },
]

function normalizeStep(status: string): string {
  if (status === 'reserved') return 'pending'
  return status
}

function StatusTimeline({ status }: { status: string }) {
  if (status === 'cancelled') return null
  const normalized = normalizeStep(status)
  const currentIdx = STEP_ORDER.indexOf(normalized)
  if (currentIdx === -1) return null

  return (
    <div className="flex items-center mt-3 mb-1">
      {TIMELINE_STEPS.map((step, idx) => {
        const done = idx < currentIdx
        const active = idx === currentIdx
        return (
          <div key={step.key} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              <span className={`text-base leading-none ${done || active ? 'opacity-100' : 'opacity-25'}`}>
                {done ? '✅' : active ? '🔵' : '⬜'}
              </span>
              <span className={`text-[10px] mt-0.5 whitespace-nowrap ${active ? 'text-gray-800 font-medium' : done ? 'text-gray-500' : 'text-gray-300'}`}>
                {step.label}
              </span>
            </div>
            {idx < TIMELINE_STEPS.length - 1 && (
              <div className={`h-px flex-1 mx-1 mb-3 ${idx < currentIdx ? 'bg-green-400' : 'bg-gray-200'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

function AssemblyChanges({ items }: { items: OrderItem[] }) {
  const removed = items.filter(i => i.is_removed)
  const changed = items.filter(i => !i.is_removed && i.qty_actual !== null && i.qty_actual !== (i.qty_ordered ?? i.qty))
  if (!removed.length && !changed.length) return null

  const actualTotal = items
    .filter(i => !i.is_removed)
    .reduce((s, i) => s + (i.qty_actual ?? i.qty_ordered ?? i.qty) * i.price, 0)

  return (
    <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
      <p className="font-medium text-amber-800 mb-1.5">Изменения в заказе</p>
      {removed.map(i => (
        <p key={i.id} className="text-amber-700">• {i.product?.name ?? '—'}: позиция снята</p>
      ))}
      {changed.map(i => (
        <p key={i.id} className="text-amber-700">
          • {i.product?.name ?? '—'}: заказано {i.qty_ordered ?? i.qty} шт, выдаётся {i.qty_actual} шт
        </p>
      ))}
      <p className="font-semibold text-amber-800 mt-2 pt-2 border-t border-amber-200">
        Итоговая сумма: {actualTotal.toLocaleString()} ₸
      </p>
    </div>
  )
}

export default function CabinetPage() {
  const { isAuthed, phone, init } = useAuthStore()
  const router = useRouter()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    init()
  }, [])

  useEffect(() => {
    if (!isAuthed || !phone) {
      router.push('/')
      return
    }
    fetch(`/api/cabinet?phone=${encodeURIComponent(phone)}`)
      .then(r => r.json())
      .then(data => {
        setOrders(data.orders ?? [])
        setLoading(false)
      })
  }, [isAuthed, phone, router])

  if (!isAuthed) return null

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Мои заказы</h1>
          <p className="text-sm text-gray-500 mt-1">📞 {phone}</p>
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
            const visibleItems = order.order_items.filter(i => !i.is_removed)
            const total = visibleItems.reduce((s, i) => s + (i.qty_actual ?? i.qty_ordered ?? i.qty) * i.price, 0)
            const date = new Date(order.created_at).toLocaleString('ru-RU', {
              timeZone: 'Asia/Oral', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
            })
            const isAssembled = order.status === 'assembled'
            const hasChanges = order.order_items.some(
              i => i.is_removed || (i.qty_actual !== null && i.qty_actual !== (i.qty_ordered ?? i.qty))
            )

            return (
              <div key={order.id} className={`border rounded-xl p-4 bg-white shadow-sm ${isAssembled ? 'border-teal-400 ring-1 ring-teal-300' : ''}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-400">{date}</span>
                  <span className={`text-xs px-2 py-1 rounded-full ${STATUS_COLORS[order.status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {STATUS_LABELS[order.status] ?? order.status}
                  </span>
                </div>

                {isAssembled && (
                  <div className="mt-2 mb-1 bg-teal-50 border border-teal-200 rounded-lg px-3 py-2 text-sm text-teal-800 font-medium">
                    Ваш заказ готов! Можете забрать.
                  </div>
                )}

                <StatusTimeline status={order.status} />

                <div className="space-y-1 mt-2">
                  {visibleItems.map(item => (
                    <div key={item.id} className="flex justify-between text-sm">
                      <span className="text-gray-700">
                        {item.product?.name ?? '—'} × {item.qty_actual ?? item.qty_ordered ?? item.qty}
                      </span>
                      <span className="text-gray-500">
                        {((item.qty_actual ?? item.qty_ordered ?? item.qty) * item.price).toLocaleString()} ₸
                      </span>
                    </div>
                  ))}
                </div>

                <div className="border-t mt-3 pt-2 flex justify-between text-sm font-semibold">
                  <span>Итого</span>
                  <span>{total.toLocaleString()} ₸</span>
                </div>

                {(isAssembled || order.status === 'delivered') && hasChanges && (
                  <AssemblyChanges items={order.order_items} />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

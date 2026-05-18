'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import OrderCard, { type KanbanOrder } from './OrderCard'

// Map every possible status to a kanban column key
const COLUMN_FOR: Record<string, string> = {
  pending:   'pending',
  reserved:  'reserved',
  confirmed: 'confirmed',
  assembling:'confirmed',
  assembled: 'confirmed',
  delivered: 'delivered',
}

const COLUMNS: { key: string; label: string; color: string }[] = [
  { key: 'pending',   label: 'Новые',      color: 'bg-yellow-400' },
  { key: 'reserved',  label: 'В работе',   color: 'bg-purple-400' },
  { key: 'confirmed', label: 'Подтверждён', color: 'bg-green-400' },
  { key: 'delivered', label: 'Выдан',      color: 'bg-blue-400'  },
]

interface Props {
  onOrderClick: (order: KanbanOrder) => void
}

export default function OrdersKanban({ onOrderClick }: Props) {
  const [orders, setOrders] = useState<KanbanOrder[]>([])
  const [loading, setLoading] = useState(true)

  const supabase = createClient()

  async function load() {
    const { data, error } = await supabase
      .from('orders')
      .select(`
        id, status, total, created_at, guest_phone, guest_name,
        client:client_id(name, phone, company_name),
        order_items(id, qty, is_removed),
        reservations(expires_at)
      `)
      .not('status', 'in', '(cancelled)')
      .order('created_at', { ascending: false })
      .limit(300)

    if (error) console.error('[OrdersKanban]', error)
    setOrders((data as KanbanOrder[] | null) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    const ch = supabase
      .channel('kanban-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, load)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  if (loading) return <div className="text-sm text-gray-400 py-6">Загрузка...</div>

  const groups: Record<string, KanbanOrder[]> = {
    pending: [], reserved: [], confirmed: [], delivered: [],
  }
  for (const o of orders) {
    const col = COLUMN_FOR[o.status]
    if (col) groups[col].push(o)
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {COLUMNS.map(col => {
        const cards = groups[col.key]
        return (
          <div key={col.key} className="flex-1 min-w-[270px] max-w-[340px] bg-gray-50 rounded-xl p-3 shrink-0">
            {/* Column header */}
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${col.color}`} />
                <h3 className="font-semibold text-sm text-gray-700">{col.label}</h3>
              </div>
              <span className="text-xs bg-white border border-gray-200 px-2 py-0.5 rounded-full text-gray-500 font-medium">
                {cards.length}
              </span>
            </div>

            {/* Cards */}
            <div className="space-y-2.5">
              {cards.length === 0 ? (
                <div className="text-xs text-gray-400 text-center py-6">Нет заказов</div>
              ) : (
                cards.map(o => (
                  <OrderCard key={o.id} order={o} onClick={onOrderClick} />
                ))
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

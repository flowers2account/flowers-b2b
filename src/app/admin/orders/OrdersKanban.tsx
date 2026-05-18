'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import toast, { Toaster } from 'react-hot-toast'
import { createClient } from '@/lib/supabase/client'
import KanbanColumn from './KanbanColumn'
import OrderCard, { type KanbanOrder } from './OrderCard'

// ── Status → column mapping ────────────────────────────────────────

const COLUMN_FOR: Record<string, string> = {
  pending:   'pending',
  reserved:  'reserved',
  confirmed: 'confirmed',
  assembling:'confirmed',
  assembled: 'confirmed',
  delivered: 'delivered',
}

const COLUMNS: { key: string; label: string; color: string }[] = [
  { key: 'pending',   label: 'Новые',       color: 'bg-yellow-400' },
  { key: 'reserved',  label: 'В работе',    color: 'bg-purple-400' },
  { key: 'confirmed', label: 'Подтверждён', color: 'bg-green-400'  },
  { key: 'delivered', label: 'Выдан',       color: 'bg-blue-400'   },
]

const COLUMN_LABEL: Record<string, string> = Object.fromEntries(COLUMNS.map(c => [c.key, c.label]))

// ── Transition validation ──────────────────────────────────────────

const ALLOWED: Record<string, string[]> = {
  pending:   ['reserved'],
  reserved:  ['pending', 'confirmed'],
  confirmed: ['delivered'],
  assembling:['delivered'],
  assembled: ['delivered'],
  delivered: [],
}

function canTransition(from: string, to: string): boolean {
  return ALLOWED[from]?.includes(to) ?? false
}

// ── Component ──────────────────────────────────────────────────────

interface Props {
  onOrderClick: (order: KanbanOrder) => void
}

export default function OrdersKanban({ onOrderClick }: Props) {
  const [orders, setOrders] = useState<KanbanOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [activeId, setActiveId] = useState<number | null>(null)

  const supabase = createClient()

  const load = useCallback(async () => {
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
  }, [])

  useEffect(() => {
    load()
    const ch = supabase
      .channel('kanban-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, load)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load])

  // ── DnD sensors: require 8px drag to start (preserves clicks) ────

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  function onDragStart({ active }: DragStartEvent) {
    setActiveId(active.id as number)
  }

  async function onDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null)
    if (!over) return

    const orderId    = active.id as number
    const targetCol  = over.id as string
    const order      = orders.find(o => o.id === orderId)
    if (!order) return

    const fromStatus = order.status
    const fromCol    = COLUMN_FOR[fromStatus] ?? fromStatus

    // Same column — no-op
    if (fromCol === targetCol) return

    // Validate transition
    if (!canTransition(fromStatus, targetCol)) {
      toast.error(`❌ Нельзя переместить из "${COLUMN_LABEL[fromCol] ?? fromCol}" в "${COLUMN_LABEL[targetCol] ?? targetCol}"`)
      return
    }

    // Optimistic update
    const prevOrders = orders
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: targetCol } : o))

    // API call
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: targetCol }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Ошибка при обновлении статуса')
      }

      toast.success(`✅ ${COLUMN_LABEL[targetCol] ?? targetCol}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ошибка')
      setOrders(prevOrders) // rollback
    }
  }

  // ── Group orders into columns ─────────────────────────────────────

  const groups: Record<string, KanbanOrder[]> = {
    pending: [], reserved: [], confirmed: [], delivered: [],
  }
  for (const o of orders) {
    const col = COLUMN_FOR[o.status]
    if (col) groups[col].push(o)
  }

  const activeOrder = activeId !== null ? orders.find(o => o.id === activeId) : null

  if (loading) return <div className="text-sm text-gray-400 py-6">Загрузка...</div>

  return (
    <>
      <Toaster
        position="top-right"
        toastOptions={{ duration: 3000, style: { fontSize: 13 } }}
      />

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {COLUMNS.map(col => (
            <KanbanColumn
              key={col.key}
              columnKey={col.key}
              label={col.label}
              colorClass={col.color}
              orders={groups[col.key]}
              activeId={activeId}
              onCardClick={onOrderClick}
            />
          ))}
        </div>

        {/* Ghost card at cursor while dragging */}
        <DragOverlay dropAnimation={null}>
          {activeOrder ? (
            <OrderCard order={activeOrder} isDragOverlay />
          ) : null}
        </DragOverlay>
      </DndContext>
    </>
  )
}

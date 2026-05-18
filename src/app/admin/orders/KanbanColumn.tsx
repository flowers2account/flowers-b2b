'use client'

import { useDroppable } from '@dnd-kit/core'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import OrderCard, { type KanbanOrder } from './OrderCard'

// ── Column color schemes ───────────────────────────────────────────

const SCHEME: Record<string, {
  colBg: string; colBorder: string
  headBg: string; headText: string
  dotColor: string; emptyText: string
}> = {
  pending:   { colBg: 'bg-yellow-50', colBorder: 'border-yellow-200', headBg: 'bg-yellow-100', headText: 'text-yellow-900', dotColor: 'bg-yellow-400', emptyText: 'text-yellow-400' },
  reserved:  { colBg: 'bg-purple-50', colBorder: 'border-purple-200', headBg: 'bg-purple-100', headText: 'text-purple-900', dotColor: 'bg-purple-400', emptyText: 'text-purple-400' },
  confirmed: { colBg: 'bg-green-50',  colBorder: 'border-green-200',  headBg: 'bg-green-100',  headText: 'text-green-900',  dotColor: 'bg-green-400',  emptyText: 'text-green-400'  },
  delivered: { colBg: 'bg-gray-50',   colBorder: 'border-gray-200',   headBg: 'bg-gray-100',   headText: 'text-gray-700',   dotColor: 'bg-gray-400',   emptyText: 'text-gray-400'   },
}

// ── Draggable wrapper ──────────────────────────────────────────────

function DraggableCard({
  order,
  onCardClick,
}: {
  order: KanbanOrder
  onCardClick: (o: KanbanOrder) => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: order.id,
  })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), touchAction: 'none' }}
      {...listeners}
      {...attributes}
    >
      <OrderCard order={order} onClick={onCardClick} isDragging={isDragging} />
    </div>
  )
}

// ── Column ─────────────────────────────────────────────────────────

interface Props {
  columnKey: string
  label: string
  colorClass: string    // kept for backward compat, not used in new scheme
  orders: KanbanOrder[]
  activeId: number | null
  onCardClick: (order: KanbanOrder) => void
}

export default function KanbanColumn({
  columnKey,
  label,
  orders,
  onCardClick,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: columnKey })
  const sc = SCHEME[columnKey] ?? SCHEME.delivered

  return (
    <div
      ref={setNodeRef}
      className={[
        'flex-1 min-w-[270px] max-w-[340px] shrink-0 rounded-xl border-2 overflow-hidden transition-shadow duration-150',
        sc.colBg, sc.colBorder,
        isOver ? 'shadow-lg ring-2 ring-[#7a1c2e]/25' : '',
      ].join(' ')}
    >
      {/* Colored header strip */}
      <div className={`px-3 py-2.5 ${sc.headBg} flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${sc.dotColor}`} />
          <h3 className={`font-semibold text-sm ${sc.headText}`}>{label}</h3>
        </div>
        <span className="text-xs bg-white/70 border border-white/50 px-2 py-0.5 rounded-full font-mono font-semibold text-gray-600 shadow-sm">
          {orders.length}
        </span>
      </div>

      {/* Cards area */}
      <div className="p-2.5 space-y-2 min-h-[80px]">
        {orders.length === 0 ? (
          <div className={`text-xs text-center py-8 transition-colors ${isOver ? 'text-[#7a1c2e] font-medium' : sc.emptyText}`}>
            {isOver ? '📥 Отпустите здесь' : '📭 Нет заказов'}
          </div>
        ) : (
          orders.map(o => (
            <DraggableCard key={o.id} order={o} onCardClick={onCardClick} />
          ))
        )}
      </div>
    </div>
  )
}

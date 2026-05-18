'use client'

import { useDroppable } from '@dnd-kit/core'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import OrderCard, { type KanbanOrder } from './OrderCard'

// ── Draggable wrapper ──────────────────────────────────────────────

function DraggableCard({
  order,
  activeId,
  onCardClick,
}: {
  order: KanbanOrder
  activeId: number | null
  onCardClick: (o: KanbanOrder) => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: order.id,
  })

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    touchAction: 'none',
  }

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <OrderCard
        order={order}
        onClick={onCardClick}
        isDragging={isDragging}
      />
    </div>
  )
}

// ── Column ─────────────────────────────────────────────────────────

interface Props {
  columnKey: string
  label: string
  colorClass: string
  orders: KanbanOrder[]
  activeId: number | null
  onCardClick: (order: KanbanOrder) => void
}

export default function KanbanColumn({
  columnKey,
  label,
  colorClass,
  orders,
  activeId,
  onCardClick,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: columnKey })

  return (
    <div
      ref={setNodeRef}
      className={[
        'flex-1 min-w-[270px] max-w-[340px] rounded-xl p-3 shrink-0 transition-colors duration-150',
        isOver ? 'bg-pink-50 ring-2 ring-[#7a1c2e]/30' : 'bg-gray-50',
      ].join(' ')}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${colorClass}`} />
          <h3 className="font-semibold text-sm text-gray-700">{label}</h3>
        </div>
        <span className="text-xs bg-white border border-gray-200 px-2 py-0.5 rounded-full text-gray-500 font-medium">
          {orders.length}
        </span>
      </div>

      {/* Cards */}
      <div className="space-y-2.5 min-h-[60px]">
        {orders.length === 0 ? (
          <div className={`text-xs text-center py-6 transition-colors ${isOver ? 'text-[#7a1c2e]' : 'text-gray-400'}`}>
            {isOver ? 'Отпустите здесь' : 'Нет заказов'}
          </div>
        ) : (
          orders.map(o => (
            <DraggableCard
              key={o.id}
              order={o}
              activeId={activeId}
              onCardClick={onCardClick}
            />
          ))
        )}
      </div>
    </div>
  )
}

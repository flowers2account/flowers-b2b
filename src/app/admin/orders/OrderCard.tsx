'use client'

export type KanbanOrder = {
  id: number
  status: string
  total: number
  created_at: string
  guest_phone: string | null
  guest_name: string | null
  client: { name: string | null; phone: string | null; company_name: string | null } | null
  order_items: { id: number; qty: number; is_removed: boolean }[]
  reservations: { expires_at: string }[]
}

export const STATUS_BADGE: Record<string, { cls: string; label: string }> = {
  assembling: { cls: 'bg-orange-100 text-orange-700', label: '🔧 Сборка' },
  assembled:  { cls: 'bg-teal-100 text-teal-800',    label: '📦 Готов'  },
}

function minExpiry(r: { expires_at: string }[]): string | null {
  if (!r?.length) return null
  return r.reduce((m, x) => x.expires_at < m ? x.expires_at : m, r[0].expires_at)
}

function reserveInfo(expiresAt: string): { text: string; cls: string; pulse: boolean } {
  const mins = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 60_000)
  if (mins <= 0)  return { text: '⏰ Резерв истёк!', cls: 'bg-red-100 text-red-700',    pulse: true  }
  if (mins <= 10) return { text: `⏰ ${mins} мин`,   cls: 'bg-orange-100 text-orange-700', pulse: true  }
  return             { text: `⏰ ${mins} мин`,   cls: 'bg-gray-100 text-gray-600',    pulse: false }
}

function amountClass(total: number): string {
  if (total >= 100_000) return 'text-purple-700 font-bold'
  if (total >= 50_000)  return 'text-rose-600 font-semibold'
  return 'text-gray-800 font-semibold'
}

interface Props {
  order: KanbanOrder
  onClick?: (order: KanbanOrder) => void
  isDragOverlay?: boolean
  isDragging?: boolean
}

export default function OrderCard({ order, onClick, isDragOverlay, isDragging }: Props) {
  const name        = order.client?.name ?? order.guest_name
  const company     = order.client?.company_name
  const phone       = order.client?.phone ?? order.guest_phone
  const displayName = company && name ? `${company} / ${name}` : company || name
  const itemsCount  = order.order_items.filter(i => !i.is_removed).length
  const expiresAt   = (order.status === 'pending' || order.status === 'reserved')
    ? minExpiry(order.reservations ?? []) : null
  const badge = STATUS_BADGE[order.status]

  return (
    <div
      onClick={isDragOverlay ? undefined : () => onClick?.(order)}
      className={[
        'bg-white rounded-lg px-3.5 py-3 border transition-all duration-150 select-none',
        isDragOverlay
          ? 'shadow-2xl rotate-2 scale-105 opacity-95 border-gray-200'
          : isDragging
            ? 'opacity-35 border-gray-100'
            : 'shadow-sm hover:shadow-md hover:scale-[1.01] hover:border-[#7a1c2e]/30 cursor-grab active:cursor-grabbing border-gray-200',
      ].join(' ')}
    >
      {/* Header row */}
      <div className="flex justify-between items-center mb-2">
        <span className="font-mono text-xs text-gray-400">#{order.id}</span>
        <div className="flex items-center gap-1.5">
          {badge && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${badge.cls}`}>{badge.label}</span>
          )}
          <span className="text-[11px] text-gray-400">
            {new Date(order.created_at).toLocaleString('ru-RU', {
              timeZone: 'Asia/Oral', day: '2-digit', month: '2-digit',
              hour: '2-digit', minute: '2-digit',
            })}
          </span>
        </div>
      </div>

      {/* Client */}
      {(displayName || phone) && (
        <div className="mb-2.5">
          {displayName && <div className="text-sm font-medium text-gray-800 leading-tight truncate">{displayName}</div>}
          {phone && <div className="text-xs text-gray-400 mt-0.5">{phone}</div>}
        </div>
      )}

      {/* Amount + items count */}
      <div className="flex justify-between items-center">
        <span className={`text-sm ${amountClass(order.total)}`}>
          {order.total.toLocaleString('ru-RU')} ₸
        </span>
        <span className="bg-gray-100 px-2 py-0.5 rounded text-xs font-mono text-gray-500">
          {itemsCount} поз.
        </span>
      </div>

      {/* Reserve expiry */}
      {expiresAt && (() => {
        const ri = reserveInfo(expiresAt)
        return (
          <div className={`mt-2 px-2 py-1 rounded text-xs font-medium ${ri.cls} ${ri.pulse ? 'animate-pulse' : ''}`}>
            {ri.text}
          </div>
        )
      })()}
    </div>
  )
}

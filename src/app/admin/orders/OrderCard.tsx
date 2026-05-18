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

const STATUS_BADGE: Record<string, string> = {
  pending:    '',
  reserved:   '',
  confirmed:  '',
  assembling: 'bg-orange-100 text-orange-700',
  assembled:  'bg-teal-100 text-teal-800',
  delivered:  '',
}

const STATUS_LABEL: Record<string, string> = {
  assembling: '🔧 Сборка',
  assembled:  '📦 Готов',
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('ru-RU', {
    timeZone: 'Asia/Oral',
    day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function minExpiry(reservations: { expires_at: string }[]): string | null {
  if (!reservations?.length) return null
  return reservations.reduce((m, r) => r.expires_at < m ? r.expires_at : m, reservations[0].expires_at)
}

interface Props {
  order: KanbanOrder
  onClick: (order: KanbanOrder) => void
}

export default function OrderCard({ order, onClick }: Props) {
  const name = order.client?.name ?? order.guest_name
  const company = order.client?.company_name
  const phone = order.client?.phone ?? order.guest_phone
  const displayName = company && name ? `${company} / ${name}` : company || name
  const itemsCount = order.order_items.filter(i => !i.is_removed).length
  const expiresAt = (order.status === 'pending' || order.status === 'reserved')
    ? minExpiry(order.reservations ?? [])
    : null
  const badge = STATUS_BADGE[order.status]
  const badgeLabel = STATUS_LABEL[order.status]

  return (
    <div
      onClick={() => onClick(order)}
      className="bg-white rounded-lg p-3.5 shadow-sm border border-gray-200 hover:shadow-md hover:border-gray-300 transition cursor-pointer select-none"
    >
      <div className="flex justify-between items-start mb-2">
        <span className="font-mono text-xs text-gray-400">#{order.id}</span>
        <div className="flex items-center gap-1.5">
          {badge && badgeLabel && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${badge}`}>{badgeLabel}</span>
          )}
          <span className="text-[11px] text-gray-400">{formatTime(order.created_at)}</span>
        </div>
      </div>

      {(displayName || phone) && (
        <div className="mb-2.5">
          {displayName && <div className="text-sm font-medium text-gray-800 leading-tight truncate">{displayName}</div>}
          {phone && <div className="text-xs text-gray-400 mt-0.5">{phone}</div>}
        </div>
      )}

      <div className="flex justify-between items-center text-sm">
        <span className="font-semibold text-gray-800">{order.total.toLocaleString('ru-RU')} ₸</span>
        <span className="text-xs text-gray-400">{itemsCount} поз.</span>
      </div>

      {expiresAt && (
        <div className="mt-2 text-[11px] text-orange-600 font-medium">
          ⏰ резерв до {new Date(expiresAt).toLocaleTimeString('ru-RU', { timeZone: 'Asia/Oral', hour: '2-digit', minute: '2-digit' })}
        </div>
      )}
    </div>
  )
}

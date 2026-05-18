// Server component — reads searchParams directly as prop (reliable, no hooks needed)
import OrdersPageClient from './OrdersPageClient'

export default function AdminOrdersPage({
  searchParams,
}: {
  searchParams: { mode?: string }
}) {
  const mode = searchParams.mode === 'kanban' ? 'kanban' : 'table'
  return <OrdersPageClient mode={mode} />
}

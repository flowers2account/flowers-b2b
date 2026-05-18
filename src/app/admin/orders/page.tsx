// Next.js 15+ / 16: searchParams is a Promise — must be awaited
import OrdersPageClient from './OrdersPageClient'

export const dynamic = 'force-dynamic'

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>
}) {
  const params = await searchParams
  const mode = params.mode === 'kanban' ? 'kanban' : 'table'
  return <OrdersPageClient mode={mode} />
}

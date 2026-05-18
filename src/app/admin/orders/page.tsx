import Link from 'next/link'
import OrdersPageClient from './OrdersPageClient'

export const dynamic = 'force-dynamic'

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>
}) {
  const params = await searchParams
  const mode = params.mode === 'kanban' ? 'kanban' : 'table'

  return (
    <div className="max-w-[1480px] mx-auto px-4 py-6">
      {/* Top bar с переключателем */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <Link href="/admin" className="text-sm text-gray-400 hover:text-gray-600">← Админка</Link>
          <h1 className="text-xl font-bold text-gray-800">Заказы</h1>
        </div>

        {/* Переключатель режима */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          <Link
            href="/admin/orders?mode=table"
            className="px-4 py-1.5 text-sm font-medium rounded-md no-underline transition-colors"
            style={mode === 'table'
              ? { backgroundColor: '#7a1c2e', color: '#fff' }
              : { color: '#555' }}
          >
            📊 Таблица
          </Link>
          <Link
            href="/admin/orders?mode=kanban"
            className="px-4 py-1.5 text-sm font-medium rounded-md no-underline transition-colors"
            style={mode === 'kanban'
              ? { backgroundColor: '#7a1c2e', color: '#fff' }
              : { color: '#555' }}
          >
            📌 Канбан
          </Link>
        </div>
      </div>

      <OrdersPageClient mode={mode} />
    </div>
  )
}

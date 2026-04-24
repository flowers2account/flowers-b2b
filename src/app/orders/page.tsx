import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import OrdersPageClient from '@/components/catalog/OrdersPageClient'

export default async function OrdersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Мои заказы</h1>
      <OrdersPageClient />
    </main>
  )
}

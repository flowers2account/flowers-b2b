import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AdminPageClient from '@/components/admin/AdminPageClient'

export default async function AdminPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/')

  const { data: products } = await supabase
    .from('products')
    .select(`id, name, category, is_active, pack_size, stock (price, qty, qty_reserved, is_available)`)
    .order('category').order('name')

  const { data: activeReservations } = await supabase
    .from('reservations')
    .select('product_id, qty')
    .gt('expires_at', new Date().toISOString())

  const reservedByProduct: Record<number, number> = {}
  for (const r of (activeReservations ?? [])) {
    reservedByProduct[r.product_id] = (reservedByProduct[r.product_id] ?? 0) + r.qty
  }

  const productsWithReserved = (products ?? []).map(p => {
    const reserved = reservedByProduct[p.id] ?? 0
    const stockRaw = p.stock
    const stockWithReserved = Array.isArray(stockRaw)
      ? stockRaw.map(s => s ? { ...s, reserved_qty: reserved } : s)
      : stockRaw ? { ...stockRaw, reserved_qty: reserved } : stockRaw
    return { ...p, stock: stockWithReserved, active_reserved: reserved }
  })

  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-green-900 font-serif mb-6">
        ⚙️ Управление остатками
      </h1>
      <AdminPageClient initialProducts={productsWithReserved} />
    </main>
  )
}

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

  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-green-900 font-serif mb-6">
        ⚙️ Управление остатками
      </h1>
      <AdminPageClient initialProducts={products ?? []} />
    </main>
  )
}

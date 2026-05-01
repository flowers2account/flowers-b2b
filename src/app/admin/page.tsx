'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/auth-store'
import { createClient } from '@/lib/supabase/client'
import AdminPageClient from '@/components/admin/AdminPageClient'

export default function AdminPage() {
  const router = useRouter()
  const { role, isAuthed, init } = useAuthStore()
  const [products, setProducts] = useState<any[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    init()
  }, [])

  useEffect(() => {
    if (!isAuthed) return
    if (role !== 'admin' && role !== 'manager') {
      router.replace('/')
      return
    }

    const supabase = createClient()

    async function load() {
      const [{ data: productRows }, { data: activeReservations }] = await Promise.all([
        supabase
          .from('products')
          .select(`id, name, category, is_active, pack_size, image_url, stock (price, qty, qty_reserved, is_available)`)
          .order('category')
          .order('name'),
        supabase
          .from('reservations')
          .select('product_id, qty')
          .gt('expires_at', new Date().toISOString()),
      ])

      const reservedByProduct: Record<number, number> = {}
      for (const r of (activeReservations ?? [])) {
        reservedByProduct[r.product_id] = (reservedByProduct[r.product_id] ?? 0) + r.qty
      }

      const productsWithReserved = (productRows ?? []).map((p: any) => {
        const reserved = reservedByProduct[p.id] ?? 0
        const stockRaw = p.stock
        const stockWithReserved = Array.isArray(stockRaw)
          ? stockRaw.map(s => s ? { ...(s as any), reserved_qty: reserved } : s)
          : stockRaw ? { ...(stockRaw as any), reserved_qty: reserved } : stockRaw
        return { ...p, stock: stockWithReserved, active_reserved: reserved }
      })

      setProducts(productsWithReserved)
      setLoading(false)
    }

    load()
  }, [isAuthed, role])

  if (loading || products === null) {
    return (
      <main className="max-w-6xl mx-auto px-4 py-8">
        <p className="text-gray-500">Загрузка...</p>
      </main>
    )
  }

  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-green-900 font-serif mb-6">
        ⚙️ Управление остатками
      </h1>
      <AdminPageClient initialProducts={products} />
    </main>
  )
}

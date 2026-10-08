'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/auth-store'
import PodZakazMarkupPanel from '@/components/admin/PodZakazMarkupPanel'
import Link from 'next/link'

export default function PodZakazAdminPage() {
  const router = useRouter()
  const { role, isAuthed, init } = useAuthStore()

  useEffect(() => { init() }, [])

  useEffect(() => {
    if (!isAuthed) return
    if (role !== 'admin' && role !== 'manager') router.replace('/')
  }, [isAuthed, role])

  if (!isAuthed || (role !== 'admin' && role !== 'manager')) {
    return <div className="text-center py-16 text-gray-400">Загрузка...</div>
  }

  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/admin"
          className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          ← Админ
        </Link>
        <h1 className="text-2xl font-bold text-[#7a1c2e] font-serif">
          Под заказ (Proflowers) — наценка
        </h1>
      </div>
      <PodZakazMarkupPanel />
    </main>
  )
}

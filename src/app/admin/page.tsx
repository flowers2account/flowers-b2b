'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/auth-store'
import AdminPageClient from '@/components/admin/AdminPageClient'

export default function AdminPage() {
  const router = useRouter()
  const { role, isAuthed, init } = useAuthStore()

  useEffect(() => {
    init()
  }, [])

  useEffect(() => {
    if (!isAuthed) return
    // Полная админка — только для admin. Оператор (manager) уходит на свой пульт.
    if (role === 'manager') { router.replace('/admin/console'); return }
    if (role !== 'admin') { router.replace('/'); return }
  }, [isAuthed, role])

  if (!isAuthed || role !== 'admin') return null

  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      <AdminPageClient />
    </main>
  )
}

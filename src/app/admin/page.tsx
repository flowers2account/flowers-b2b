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
    if (role !== 'admin' && role !== 'manager') {
      router.replace('/')
    }
  }, [isAuthed, role])

  if (!isAuthed) return null

  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      <AdminPageClient />
    </main>
  )
}

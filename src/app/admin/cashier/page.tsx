'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/auth-store'
import CashierView from '@/components/admin/CashierView'

export default function CashierPage() {
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
    <main>
      <CashierView />
    </main>
  )
}

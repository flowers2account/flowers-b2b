'use client'
import Link from 'next/link'
import { useAuthStore } from '@/lib/auth-store'
import { useState, useEffect } from 'react'
import AuthModal from './AuthModal'

export default function Header() {
  const { isAuthed, phone, role, init, logout } = useAuthStore()
  const [showAuth, setShowAuth] = useState(false)

  useEffect(() => {
    init()
  }, [])

  return (
    <header className="border-b bg-white sticky top-0 z-50 shadow-sm">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <div>
          <span className="text-green-900 font-bold font-serif text-lg">🌸 Цветы Уральска</span>
          <span className="text-muted-foreground text-xs ml-2">оптовый склад</span>
        </div>
        <div className="flex items-center gap-3">
          {isAuthed ? (
            <>
              {(role === 'admin' || role === 'manager') && (
                <Link href="/admin" className="text-sm bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg text-gray-700">
                  ⚙️ Админка
                </Link>
              )}
              <Link href="/cabinet" className="text-sm text-gray-600 hover:text-gray-800">
                📋 Мои заказы
              </Link>
              <span className="text-sm text-gray-600">👤 {phone}</span>
              <button
                onClick={() => logout()}
                className="text-sm text-gray-400 hover:text-gray-600"
              >
                Выйти
              </button>
            </>
          ) : (
            <button
              onClick={() => setShowAuth(true)}
              className="text-sm bg-pink-500 text-white px-4 py-2 rounded-lg hover:bg-pink-600"
            >
              Войти
            </button>
          )}
        </div>
      </div>
      {showAuth && (
        <AuthModal onClose={() => setShowAuth(false)} />
      )}
    </header>
  )
}

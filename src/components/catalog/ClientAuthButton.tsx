'use client'
import { useState } from 'react'
import { useAuthStore } from '@/lib/auth-store'
import AuthModal from './AuthModal'

export default function ClientAuthButton() {
  const { isAuthed, phone, logout } = useAuthStore()
  const [showAuth, setShowAuth] = useState(false)

  return (
    <div className="flex items-center gap-3">
      {isAuthed ? (
        <>
          <span className="text-sm text-gray-600 hidden sm:block">👤 {phone}</span>
          <button onClick={() => logout()} className="text-sm text-gray-400 hover:text-gray-600">
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
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </div>
  )
}

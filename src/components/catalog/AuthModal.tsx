'use client'
import { useState } from 'react'
import { useAuthStore } from '@/lib/auth-store'

interface Props {
  onSuccess?: () => void
  onClose: () => void
}

export default function AuthModal({ onSuccess, onClose }: Props) {
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const login = useAuthStore((s) => s.login)

  async function handleSubmit() {
    if (!phone.trim() || !pin.trim()) return
    setLoading(true)
    setError('')
    const result = await login(phone.trim(), pin.trim())
    setLoading(false)
    if (result.error) {
      setError(result.error)
      return
    }
    onSuccess?.()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm mx-4 shadow-xl">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">Вход для клиентов</h2>

        <input
          type="tel"
          placeholder="+7 777 123 45 67"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base mb-3 focus:outline-none focus:border-pink-400"
          autoFocus
        />

        <input
          type="password"
          placeholder="PIN (4-6 цифр)"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base mb-3 focus:outline-none focus:border-pink-400"
          maxLength={6}
        />

        {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full bg-pink-500 hover:bg-pink-600 text-white font-medium py-3 rounded-lg transition disabled:opacity-50"
        >
          {loading ? 'Входим...' : 'Войти'}
        </button>

        <button onClick={onClose} className="w-full mt-2 text-sm text-gray-400 hover:text-gray-600 py-2">
          Отмена
        </button>

        <p className="text-xs text-gray-400 text-center mt-3">
          Для получения доступа обратитесь к менеджеру
        </p>
      </div>
    </div>
  )
}

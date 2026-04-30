'use client'
import { useState } from 'react'
import { useAuthStore } from '@/lib/auth-store'

interface Props {
  onSuccess?: () => void
  onClose: () => void
}

export default function PhoneAuthModal({ onSuccess, onClose }: Props) {
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const setClient = useAuthStore((s) => s.setClient)

  async function handleSubmit() {
    if (!phone.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Ошибка')
        return
      }
      setClient(data.id, data.name, data.phone)
      onSuccess?.()
      onClose()
    } catch {
      setError('Ошибка соединения')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm mx-4 shadow-xl">
        <h2 className="text-xl font-semibold text-gray-800 mb-1">Вход для клиентов</h2>
        <p className="text-sm text-gray-500 mb-4">Введите номер телефона, который указан у вашего менеджера</p>

        <input
          type="tel"
          placeholder="+7 777 123 45 67"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base mb-3 focus:outline-none focus:border-pink-400"
          autoFocus
        />

        {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full bg-pink-500 hover:bg-pink-600 text-white font-medium py-3 rounded-lg transition disabled:opacity-50"
        >
          {loading ? 'Проверяем...' : 'Войти'}
        </button>

        <button onClick={onClose} className="w-full mt-2 text-sm text-gray-400 hover:text-gray-600 py-2">
          Отмена
        </button>
      </div>
    </div>
  )
}

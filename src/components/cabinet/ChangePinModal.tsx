'use client'
import { useState } from 'react'
import { useAuthStore } from '@/lib/auth-store'

interface Props {
  isOpen: boolean
  onClose: () => void
}

export default function ChangePinModal({ isOpen, onClose }: Props) {
  const { phone } = useAuthStore()
  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  if (!isOpen) return null

  function reset() {
    setCurrentPin(''); setNewPin(''); setConfirmPin('')
    setError(''); setSuccess(false)
  }

  function handleClose() { reset(); onClose() }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!currentPin || !newPin || !confirmPin) { setError('Заполните все поля'); return }
    if (newPin !== confirmPin) { setError('Новые PIN-коды не совпадают'); return }
    if (!/^\d{6}$/.test(newPin)) { setError('PIN — ровно 6 цифр'); return }
    if (currentPin === newPin) { setError('Новый PIN совпадает с текущим'); return }

    setLoading(true)
    try {
      const res = await fetch('/api/client/change-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, currentPin, newPin }),
      })
      const data = await res.json()
      if (data.success) {
        setSuccess(true)
        setTimeout(() => { reset(); onClose() }, 1800)
      } else {
        setError(data.error || 'Ошибка смены PIN')
      }
    } catch {
      setError('Ошибка соединения с сервером')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-sm shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-base font-semibold text-gray-800">Сменить PIN-код</h2>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        {success ? (
          <div className="px-6 py-8 text-center">
            <div className="text-4xl mb-3">✅</div>
            <p className="font-medium text-gray-800">PIN-код изменён</p>
            <p className="text-sm text-gray-500 mt-1">Используйте новый код для входа</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
            {[
              { label: 'Текущий PIN', value: currentPin, onChange: setCurrentPin },
              { label: 'Новый PIN (6 цифр)', value: newPin, onChange: setNewPin },
              { label: 'Подтвердите новый PIN', value: confirmPin, onChange: setConfirmPin },
            ].map(({ label, value, onChange }) => (
              <div key={label}>
                <label className="block text-xs text-gray-500 mb-1.5">{label}</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={value}
                  onChange={e => onChange(e.target.value.replace(/\D/g, ''))}
                  disabled={loading}
                  placeholder="••••••"
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-pink-400"
                />
              </div>
            ))}

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
            )}

            <div className="flex gap-2 pt-1">
              <button type="button" onClick={handleClose} disabled={loading}
                className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                Отмена
              </button>
              <button type="submit" disabled={loading}
                className="flex-1 py-2.5 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
                style={{ backgroundColor: 'var(--accent)' }}>
                {loading ? 'Сохранение...' : 'Изменить PIN'}
              </button>
            </div>

            <p className="text-xs text-gray-400 text-center">
              После смены используйте новый PIN для входа
            </p>
          </form>
        )}
      </div>
    </div>
  )
}

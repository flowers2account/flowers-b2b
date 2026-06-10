'use client'
import { useState, useEffect } from 'react'
import { authHeaders } from '@/lib/api-token'

interface Props {
  isOpen: boolean
  onClose: () => void
  currentName: string
  currentCompany: string
  onSuccess?: () => void
}

export default function EditProfileModal({ isOpen, onClose, currentName, currentCompany, onSuccess }: Props) {
  const [name, setName] = useState(currentName)
  const [company, setCompany] = useState(currentCompany)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  // Sync props when modal opens
  useEffect(() => {
    if (isOpen) { setName(currentName); setCompany(currentCompany); setError(''); setSuccess(false) }
  }, [isOpen, currentName, currentCompany])

  if (!isOpen) return null

  function handleClose() { setError(''); setSuccess(false); onClose() }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Укажите имя'); return }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/client/update-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ name: name.trim(), company_name: company.trim() }),
      })
      const data = await res.json()
      if (data.success) {
        setSuccess(true)
        setTimeout(() => { onSuccess?.() }, 1600)
      } else {
        setError(data.error || 'Ошибка сохранения')
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
          <h2 className="text-base font-semibold text-gray-800">Редактировать профиль</h2>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        {success ? (
          <div className="px-6 py-10 text-center">
            <div className="text-4xl mb-3">✅</div>
            <p className="font-medium text-gray-800">Профиль обновлён</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">
                Имя и фамилия <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                disabled={loading}
                autoFocus
                placeholder="Иванов Иван Иванович"
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-pink-400"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Компания</label>
              <input
                type="text"
                value={company}
                onChange={e => setCompany(e.target.value)}
                disabled={loading}
                placeholder="ИП Иванов (необязательно)"
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-pink-400"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
            )}

            <div className="flex gap-2 pt-1">
              <button type="button" onClick={handleClose} disabled={loading}
                className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                Отмена
              </button>
              <button type="submit" disabled={loading}
                className="flex-1 py-2.5 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                style={{ backgroundColor: 'var(--accent)' }}>
                {loading ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

'use client'

import { useState, useEffect } from 'react'
import WriteoffModal from './WriteoffModal'

interface Writeoff {
  id: number
  created_at: string
  quantity: number
  reason: string | null
  photo_url: string | null
  products: { name: string; variety_name: string | null; length_str: string | null } | null
  profiles: { full_name: string | null; display_name: string | null } | null
}

function productName(w: Writeoff): string {
  if (!w.products) return '—'
  return [w.products.variety_name || w.products.name, w.products.length_str].filter(Boolean).join(' ')
}

function staffName(w: Writeoff): string {
  return w.profiles?.display_name || w.profiles?.full_name || '—'
}

export default function WriteoffsTab() {
  const [writeoffs, setWriteoffs] = useState<Writeoff[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modalOpen, setModalOpen] = useState(false)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/writeoffs')
      const result = await res.json()
      if (result.success) {
        setWriteoffs(result.data ?? [])
      } else {
        setError(result.error || 'Ошибка загрузки')
      }
    } catch {
      setError('Ошибка загрузки')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-600">История списаний</span>
        <button
          onClick={() => setModalOpen(true)}
          className="px-3 py-1.5 bg-red-600 text-white text-sm rounded hover:bg-red-700 transition-colors"
        >
          🗑 Списать товар
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
      )}

      {loading ? (
        <div className="text-sm text-gray-400 py-6 text-center">Загрузка...</div>
      ) : writeoffs.length === 0 ? (
        <div className="text-sm text-gray-400 py-10 text-center">
          <div className="text-3xl mb-2">📋</div>
          Списаний пока нет
        </div>
      ) : (
        <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr className="text-xs text-gray-500 font-medium">
                <th className="text-left px-4 py-2.5">Дата</th>
                <th className="text-left px-4 py-2.5">Товар</th>
                <th className="text-center px-4 py-2.5 w-20">Кол-во</th>
                <th className="text-left px-4 py-2.5">Причина</th>
                <th className="text-left px-4 py-2.5">Кто списал</th>
                <th className="text-center px-4 py-2.5 w-16">Фото</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {writeoffs.map(w => (
                <tr key={w.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">
                    {new Date(w.created_at).toLocaleString('ru-RU', {
                      timeZone: 'Asia/Oral', day: '2-digit', month: '2-digit',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-gray-800">{productName(w)}</td>
                  <td className="px-4 py-2.5 text-center font-mono">{w.quantity}</td>
                  <td className="px-4 py-2.5 text-gray-600">{w.reason || <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-2.5 text-gray-500">{staffName(w)}</td>
                  <td className="px-4 py-2.5 text-center">
                    {w.photo_url
                      ? <a href={w.photo_url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700 text-xs">📷</a>
                      : <span className="text-gray-300">—</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <WriteoffModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={() => { setModalOpen(false); load() }}
      />
    </div>
  )
}

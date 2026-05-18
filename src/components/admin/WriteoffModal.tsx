'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Product {
  id: number
  name: string
  variety_name: string | null
  length_str: string | null
  stock?: { qty: number }[] | null
}

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

function productLabel(p: Product): string {
  return [p.variety_name || p.name, p.length_str].filter(Boolean).join(' ')
}

export default function WriteoffModal({ isOpen, onClose, onSuccess }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Product[]>([])
  const [selected, setSelected] = useState<Product | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [reason, setReason] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)

  if (!isOpen) return null

  async function handleSearch(q: string) {
    setQuery(q)
    setSelected(null)
    if (q.length < 2) { setResults([]); return }

    const { data } = await supabase
      .from('products')
      .select('id, name, variety_name, length_str, stock(qty)')
      .or(`name.ilike.%${q}%,variety_name.ilike.%${q}%`)
      .eq('is_active', true)
      .limit(12)

    setResults(data || [])
  }

  function selectProduct(p: Product) {
    setSelected(p)
    setQuery(productLabel(p))
    setResults([])
    setQuantity(1)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selected) { setError('Выберите товар'); return }
    if (quantity <= 0) { setError('Количество должно быть > 0'); return }

    const available = Array.isArray(selected.stock) ? (selected.stock[0]?.qty ?? 0) : 0
    if (quantity > available) {
      setError(`На складе только ${available} шт`)
      return
    }

    setLoading(true)
    setError('')

    try {
      // Upload photo if provided
      let photo_url: string | null = null
      if (photo) {
        const ext = photo.name.split('.').pop()
        const path = `${Date.now()}.${ext}`
        const { error: uploadError } = await supabase.storage
          .from('writeoff-photos')
          .upload(path, photo, { upsert: false })

        if (uploadError) {
          console.error('Photo upload failed:', uploadError.message)
          // Continue without photo rather than failing
        } else {
          const { data: { publicUrl } } = supabase.storage
            .from('writeoff-photos')
            .getPublicUrl(path)
          photo_url = publicUrl
        }
      }

      // Create writeoff
      const res = await fetch('/api/writeoffs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: selected.id,
          quantity,
          reason: reason.trim() || null,
          photo_url,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Ошибка при списании')

      // Telegram notification (fire-and-forget)
      fetch('/api/telegram/notify-writeoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_name: productLabel(selected),
          quantity,
          reason: reason.trim() || null,
          photo_url,
        }),
      }).catch(() => {})

      setSuccess(true)
      onSuccess?.()
      setTimeout(() => {
        setSuccess(false)
        setSelected(null); setQuery(''); setQuantity(1)
        setReason(''); setPhoto(null)
        if (fileRef.current) fileRef.current.value = ''
        onClose()
      }, 1400)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка')
    } finally {
      setLoading(false)
    }
  }

  const availableQty = selected && Array.isArray(selected.stock) ? (selected.stock[0]?.qty ?? 0) : null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-base font-semibold text-gray-800">🗑 Списание товара</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        {success ? (
          <div className="px-6 py-10 text-center">
            <div className="text-4xl mb-3">✅</div>
            <p className="font-medium text-gray-800">Списание создано</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
            {/* Product search */}
            <div className="relative">
              <label className="block text-xs text-gray-500 mb-1.5">Товар</label>
              <input
                type="text"
                value={query}
                onChange={e => handleSearch(e.target.value)}
                placeholder="Начните вводить название..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-red-400"
              />
              {results.length > 0 && (
                <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {results.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => selectProduct(p)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between"
                    >
                      <span>{productLabel(p)}</span>
                      {Array.isArray(p.stock) && p.stock[0] && (
                        <span className="text-xs text-gray-400 ml-2">{p.stock[0].qty} шт</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
              {selected && availableQty !== null && (
                <p className="text-xs text-gray-500 mt-1">На складе: {availableQty} шт</p>
              )}
            </div>

            {/* Quantity */}
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Количество</label>
              <input
                type="number"
                min={1}
                max={availableQty ?? undefined}
                value={quantity}
                onChange={e => setQuantity(parseInt(e.target.value) || 1)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-red-400"
              />
            </div>

            {/* Reason */}
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Причина (опционально)</label>
              <textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="Брак, повреждение, порча..."
                rows={2}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-red-400 resize-none"
              />
            </div>

            {/* Photo */}
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Фото (опционально)</label>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={e => setPhoto(e.target.files?.[0] || null)}
                className="w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200"
              />
              {photo && <p className="text-xs text-gray-400 mt-1">{photo.name}</p>}
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
            )}

            <div className="flex gap-2 pt-1">
              <button type="button" onClick={onClose} disabled={loading}
                className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                Отмена
              </button>
              <button type="submit" disabled={loading || !selected}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50">
                {loading ? 'Списываем...' : 'Списать'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

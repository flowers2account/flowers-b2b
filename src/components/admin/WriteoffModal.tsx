'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

interface StockRow {
  qty: number
  qty_reserved: number
}

interface Product {
  id: number
  name: string
  variety_name: string | null
  length_str: string | null
  stock?: StockRow[] | null
}

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

function productLabel(p: Product): string {
  return [p.variety_name || p.name, p.length_str].filter(Boolean).join(' ')
}

function calcAvailable(p: Product | null): number {
  if (!p || !Array.isArray(p.stock) || !p.stock[0]) return 0
  return Math.max(0, p.stock[0].qty - p.stock[0].qty_reserved)
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
    setError('')
    if (q.length < 2) { setResults([]); return }

    // !inner excludes products without stock; gt filters out zero-stock
    const { data } = await supabase
      .from('products')
      .select('id, name, variety_name, length_str, stock!inner(qty, qty_reserved)')
      .or(`name.ilike.%${q}%,variety_name.ilike.%${q}%`)
      .eq('is_active', true)
      .gt('stock.qty', 0)
      .limit(12)

    setResults((data as Product[]) || [])
  }

  function selectProduct(p: Product) {
    setSelected(p)
    setQuery(productLabel(p))
    setResults([])
    setQuantity(1)
    setError('')
  }

  function handleQuantityChange(val: number) {
    const avail = calcAvailable(selected)
    if (val > avail) {
      setError(`Доступно только ${avail} шт`)
      setQuantity(avail)
    } else {
      setError('')
      setQuantity(val < 1 ? 1 : val)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selected) { setError('Выберите товар'); return }
    if (quantity <= 0) { setError('Количество должно быть > 0'); return }

    const avail = calcAvailable(selected)
    if (quantity > avail) {
      setError(`На складе только ${avail} шт`)
      return
    }

    setLoading(true)
    setError('')

    try {
      let photo_url: string | null = null
      if (photo) {
        const ext = photo.name.split('.').pop()
        const path = `${Date.now()}.${ext}`
        const { error: uploadError } = await supabase.storage
          .from('writeoff-photos')
          .upload(path, photo, { upsert: false })

        if (!uploadError) {
          const { data: { publicUrl } } = supabase.storage
            .from('writeoff-photos')
            .getPublicUrl(path)
          photo_url = publicUrl
        }
      }

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
        setReason(''); setPhoto(null); setError('')
        if (fileRef.current) fileRef.current.value = ''
        onClose()
      }, 1400)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка')
    } finally {
      setLoading(false)
    }
  }

  const availableQty = calcAvailable(selected)

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
                autoComplete="off"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-red-400"
              />

              {/* Dropdown results */}
              {results.length > 0 && (
                <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                  {results.map(p => {
                    const avail = calcAvailable(p)
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => selectProduct(p)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between gap-3"
                      >
                        <span className="font-medium text-gray-800 truncate">{productLabel(p)}</span>
                        <span className="shrink-0 text-xs px-2 py-0.5 rounded bg-green-100 text-green-800 font-medium">
                          {avail} шт
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}

              {/* No results message */}
              {query.length >= 2 && results.length === 0 && !selected && (
                <p className="text-xs text-gray-400 mt-1.5">Товары не найдены или отсутствуют на складе</p>
              )}
            </div>

            {/* Selected product info */}
            {selected && (
              <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm">
                <div className="font-medium text-gray-800">{productLabel(selected)}</div>
                <div className="text-gray-500 mt-0.5">
                  Доступно: <span className="font-semibold text-green-700">{availableQty} шт</span>
                </div>
              </div>
            )}

            {/* Quantity */}
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Количество</label>
              <input
                type="number"
                min={1}
                max={availableQty > 0 ? availableQty : undefined}
                value={quantity}
                onChange={e => handleQuantityChange(parseInt(e.target.value) || 1)}
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
              <button type="submit" disabled={loading || !selected || availableQty === 0}
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

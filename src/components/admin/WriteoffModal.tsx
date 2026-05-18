'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/lib/auth-store'
import toast from 'react-hot-toast'

interface Product {
  id: number
  name: string
  variety_name: string
  length_str: string | null
  qty: number
  qty_reserved: number
  available: number
  price: number
}

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

function productLabel(p: Product): string {
  return [p.variety_name, p.length_str].filter(Boolean).join(' ')
}

export default function WriteoffModal({ isOpen, onClose, onSuccess }: Props) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Product[]>([])
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [reason, setReason] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [success, setSuccess] = useState(false)

  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const { user } = useAuthStore()

  if (!isOpen) return null

  async function handleSearch(query: string) {
    setSearchQuery(query)
    setSelectedProduct(null)
    if (query.length < 2) { setSearchResults([]); return }

    const { data, error } = await supabase
      .rpc('search_products_for_writeoff', { search_query: query })

    if (error) {
      console.error('Search error:', error)
      toast.error('Ошибка поиска')
      return
    }

    setSearchResults(data || [])
  }

  function handleQuantityChange(value: number) {
    if (!selectedProduct) return
    if (value > selectedProduct.available) {
      toast.error(`Доступно только ${selectedProduct.available} шт`)
      setQuantity(selectedProduct.available)
    } else {
      setQuantity(value < 1 ? 1 : value)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedProduct) { toast.error('Выберите товар'); return }
    if (quantity < 1) { toast.error('Количество должно быть > 0'); return }
    if (quantity > selectedProduct.available) {
      toast.error(`На складе только ${selectedProduct.available} шт`)
      return
    }

    setUploading(true)

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
          product_id: selectedProduct.id,
          quantity,
          userId: user?.id,
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
          product_name: productLabel(selectedProduct),
          quantity,
          reason: reason.trim() || null,
          photo_url,
        }),
      }).catch(() => {})

      toast.success('Списание создано')
      setSuccess(true)
      onSuccess?.()
      setTimeout(() => {
        setSuccess(false)
        setSelectedProduct(null); setSearchQuery(''); setQuantity(1)
        setReason(''); setPhoto(null)
        if (fileRef.current) fileRef.current.value = ''
        onClose()
      }, 1400)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ошибка')
    } finally {
      setUploading(false)
    }
  }

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
                value={searchQuery}
                onChange={e => handleSearch(e.target.value)}
                placeholder="Начните вводить название..."
                autoComplete="off"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-red-400"
              />

              {searchResults.length > 0 && (
                <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                  {searchResults.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setSelectedProduct(p)
                        setSearchResults([])
                        setSearchQuery(productLabel(p))
                        setQuantity(1)
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center justify-between gap-3 border-b last:border-b-0"
                    >
                      <span className="font-medium text-gray-800 truncate">
                        {p.variety_name} {p.length_str || ''}
                      </span>
                      <span className="shrink-0 text-xs px-2 py-0.5 rounded bg-green-100 text-green-800 font-semibold">
                        {p.available} шт
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {searchQuery.length >= 2 && searchResults.length === 0 && !selectedProduct && (
                <p className="text-xs text-gray-400 mt-1.5">Товары не найдены или отсутствуют на складе</p>
              )}
            </div>

            {/* Selected product info */}
            {selectedProduct && (
              <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm space-y-1">
                <div className="font-semibold text-gray-800">{productLabel(selectedProduct)}</div>
                <div className="flex justify-between text-gray-700">
                  <span>Доступно:</span>
                  <span className="font-semibold text-green-700">{selectedProduct.available} шт</span>
                </div>
                <div className="flex justify-between text-gray-700">
                  <span>Цена:</span>
                  <span className="font-semibold">{selectedProduct.price.toLocaleString('ru-RU')} ₸</span>
                </div>
              </div>
            )}

            {/* Quantity */}
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Количество</label>
              <input
                type="number"
                min={1}
                max={selectedProduct?.available || 1}
                value={quantity}
                onChange={e => handleQuantityChange(parseInt(e.target.value) || 1)}
                disabled={!selectedProduct}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-red-400 disabled:bg-gray-50"
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

            <div className="flex gap-2 pt-1">
              <button type="button" onClick={onClose} disabled={uploading}
                className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                Отмена
              </button>
              <button
                type="submit"
                disabled={uploading || !selectedProduct || (selectedProduct?.available ?? 0) === 0}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {uploading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="animate-spin">⏳</span> Списываем...
                  </span>
                ) : 'Списать'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

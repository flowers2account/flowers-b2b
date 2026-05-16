'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

type EditItem = {
  id?: number
  product_id: number
  name: string
  qty: number
  price: number
  pack_size: number
  is_new?: boolean
}

type SearchResult = {
  id: number
  name: string
  pack_size: number
  price: number
  available_qty: number
}

type Props = {
  orderId: number
  initialItems: EditItem[]
  onClose: () => void
  onSaved: () => void
}

export default function OrderEditModal({ orderId, initialItems, onClose, onSaved }: Props) {
  const [items, setItems] = useState<EditItem[]>(initialItems)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([])
      return
    }
    if (searchRef.current) clearTimeout(searchRef.current)
    searchRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(`/api/search-products?q=${encodeURIComponent(searchQuery)}`)
        const data = await res.json()
        setSearchResults(Array.isArray(data) ? data : [])
      } finally {
        setSearching(false)
      }
    }, 300)
  }, [searchQuery])

  function decreaseQty(idx: number) {
    setItems(prev => prev.map((item, i) =>
      i === idx ? { ...item, qty: Math.max(item.pack_size, item.qty - item.pack_size) } : item
    ))
  }

  function increaseQty(idx: number) {
    setItems(prev => prev.map((item, i) =>
      i === idx ? { ...item, qty: item.qty + item.pack_size } : item
    ))
  }

  function updateQty(idx: number, newQty: number) {
    setItems(prev => prev.map((item, i) =>
      i === idx ? { ...item, qty: Math.max(1, newQty) } : item
    ))
  }

  function validateQty(idx: number) {
    setItems(prev => prev.map((item, i) =>
      i === idx ? { ...item, qty: Math.max(1, item.qty) } : item
    ))
  }

  function removeItem(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  function addProduct(result: SearchResult) {
    const alreadyIn = items.findIndex(i => i.product_id === result.id)
    if (alreadyIn !== -1) {
      increaseQty(alreadyIn)
    } else {
      setItems(prev => [...prev, {
        product_id: result.id,
        name: result.name,
        qty: result.pack_size,
        price: result.price,
        pack_size: result.pack_size,
        is_new: true,
      }])
    }
    setSearchQuery('')
    setSearchResults([])
  }

  async function save() {
    setSaving(true)
    setError(null)
    const supabase = createClient()
    try {
      for (const item of items) {
        if (item.is_new || !item.id) {
          await supabase.from('order_items').insert({
            order_id: orderId,
            product_id: item.product_id,
            qty: item.qty,
            qty_ordered: item.qty,
            price: item.price,
          })
        } else {
          const original = initialItems.find(i => i.id === item.id)
          if (original && original.qty !== item.qty) {
            await supabase.from('order_items').update({ qty: item.qty }).eq('id', item.id)
          }
        }
      }

      // Remove items that were deleted (had an id but are no longer in items)
      for (const orig of initialItems) {
        if (orig.id && !items.find(i => i.id === orig.id)) {
          await supabase.from('order_items').delete().eq('id', orig.id)
        }
      }

      // Recalculate total
      const newTotal = items.reduce((sum, i) => sum + i.qty * i.price, 0)
      await supabase.from('orders').update({ total: newTotal }).eq('id', orderId)

      onSaved()
    } catch (e: any) {
      setError(e?.message ?? 'Ошибка при сохранении')
    } finally {
      setSaving(false)
    }
  }

  const total = items.reduce((sum, i) => sum + i.qty * i.price, 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">Редактирование заказа #{orderId}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="px-6 py-4 space-y-3">
          {items.map((item, idx) => (
            <div key={item.id ?? `new-${item.product_id}`} className="flex items-center gap-3 py-2 border-b last:border-0">
              <div className="flex-1 text-sm font-medium text-gray-800">{item.name}</div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => decreaseQty(idx)}
                  className="w-7 h-7 rounded border text-gray-600 hover:bg-gray-100 flex items-center justify-center text-base leading-none"
                >−</button>

                <input
                  type="number"
                  value={item.qty}
                  onChange={e => updateQty(idx, parseInt(e.target.value) || 1)}
                  onBlur={() => validateQty(idx)}
                  min={1}
                  className="w-20 text-center border rounded px-2 py-1 text-sm"
                />

                <button
                  onClick={() => increaseQty(idx)}
                  className="w-7 h-7 rounded border text-gray-600 hover:bg-gray-100 flex items-center justify-center text-base leading-none"
                >+</button>

                <span className="text-xs text-gray-400 w-16">шаг: {item.pack_size}</span>
              </div>

              <div className="text-sm text-gray-600 w-24 text-right">
                {(item.qty * item.price).toLocaleString('ru-RU')} ₸
              </div>

              <button
                onClick={() => removeItem(idx)}
                className="text-gray-300 hover:text-red-400 text-lg leading-none ml-1"
              >×</button>
            </div>
          ))}

          {items.length === 0 && (
            <div className="text-sm text-gray-400 py-2">Нет позиций</div>
          )}
        </div>

        {/* Поиск товара */}
        <div className="px-6 pb-4">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Добавить товар — начните вводить название..."
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            {searching && (
              <span className="absolute right-3 top-2.5 text-xs text-gray-400">Поиск...</span>
            )}
            {searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 bg-white border rounded-lg shadow-lg z-10 mt-1 max-h-52 overflow-y-auto">
                {searchResults.map(r => (
                  <button
                    key={r.id}
                    onClick={() => addProduct(r)}
                    className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-50 text-left"
                  >
                    <span className="font-medium text-gray-800">{r.name}</span>
                    <span className="text-gray-500 text-xs shrink-0 ml-2">
                      {r.price.toLocaleString('ru-RU')} ₸ · ост. {r.available_qty} шт
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="mx-6 mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between px-6 py-4 border-t bg-gray-50 rounded-b-xl">
          <span className="text-sm font-semibold text-gray-700">
            Итого: {total.toLocaleString('ru-RU')} ₸
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border rounded-lg hover:bg-gray-100">
              Отмена
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {saving ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

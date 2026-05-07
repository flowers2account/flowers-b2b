'use client'

import { useState, useMemo, useEffect } from 'react'
import { useCart } from '@/lib/cart-store'
import { useAuthStore } from '@/lib/auth-store'
import { useFilters } from '@/lib/filter-store'
import { createClient } from '@/lib/supabase/client'
import AuthModal from './AuthModal'
import ProductCard, { type Product, getAvailable, getPrice } from './ProductCard'

export default function PriceTable({ products: initialProducts }: { products: Product[] }) {
  const [products, setProducts] = useState(initialProducts)
  const [showAuth, setShowAuth] = useState(false)
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null)
  const { items, add, update } = useCart()
  const { isAuthed } = useAuthStore()
  const { category, onlyDiscount, search } = useFilters()

  function requireAuth(action: () => void) {
    if (isAuthed) { action() }
    else { setPendingAction(() => action); setShowAuth(true) }
  }

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('stock-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock' }, async () => {
        const res = await fetch('/api/products')
        const data = await res.json()
        if (data) setProducts(data)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const getQty = (id: number) => items.find(i => i.id === id)?.qty ?? 0

  const filtered = useMemo(() => {
    return products.filter(p => {
      const available = getAvailable(p.stock)
      const price = getPrice(p.stock)
      const hasDiscount = !!(p.previous_price && p.previous_price > price)

      if (category !== 'all' && p.category !== category) return false
      if (onlyDiscount && !hasDiscount) return false
      if (search) {
        const name = (p.variety_name || p.name).toLowerCase()
        if (!name.includes(search.toLowerCase())) return false
      }
      return true
    })
  }, [products, category, onlyDiscount, search])

  return (
    <div>
      <div className="text-xs text-gray-400 mb-3">{filtered.length} позиций</div>

      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
        {filtered.map(product => {
          const qty = getQty(product.id)
          const available = getAvailable(product.stock)
          const price = getPrice(product.stock)
          return (
            <ProductCard
              key={product.id}
              product={product}
              qty={qty}
              isAuthed={isAuthed}
              onDecrement={() => requireAuth(() =>
                update(product.id, Math.max(0, qty - (product.pack_size || 5)))
              )}
              onIncrement={() => requireAuth(() => {
                const packSize = product.pack_size || 5
                if (qty === 0) {
                  add({
                    id: product.id,
                    name: (product.variety_name || product.name) + (product.length_str ? ' ' + product.length_str : ''),
                    price,
                    available,
                    category: product.category,
                  })
                  update(product.id, packSize)
                } else {
                  update(product.id, qty + packSize)
                }
              })}
            />
          )
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center text-gray-400 py-16">Ничего не найдено</div>
      )}

      {showAuth && (
        <AuthModal
          onClose={() => { setShowAuth(false); setPendingAction(null) }}
          onSuccess={() => { pendingAction?.() }}
        />
      )}
    </div>
  )
}

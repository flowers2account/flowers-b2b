'use client'

import { useState, useMemo, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useCart } from '@/lib/cart-store'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/lib/auth-store'
import PhoneAuthModal from './PhoneAuthModal'

type Stock = { price: number; qty: number; qty_reserved: number; is_available: boolean; available_qty?: number; reserved_qty?: number } | null
type Product = {
  id: number
  name: string
  variety_name: string | null
  length_str: string | null
  length_cm: number | null
  category: string
  pack_size: number
  image_url?: string | null
  stock: Stock[] | Stock
}

type VarietyGroup = {
  variety_name: string
  category: string
  image_url: string | null
  sizes: Product[]
}

function getStock(s: Stock[] | Stock): Stock {
  if (Array.isArray(s)) return s[0] ?? null
  return s
}

function getAvailable(s: Stock[] | Stock): number {
  const st = getStock(s)
  if (!st) return 0
  return st.available_qty ?? Math.max(0, st.qty - st.qty_reserved)
}

function getPrice(s: Stock[] | Stock): number {
  const st = getStock(s)
  return st?.price ?? 0
}

function StockBadge({ qty }: { qty: number }) {
  if (qty <= 5) return <Badge variant="destructive">{qty} шт</Badge>
  if (qty <= 30) return <Badge className="bg-orange-500 hover:bg-orange-600">{qty} шт</Badge>
  return <Badge className="bg-green-600 hover:bg-green-700">{qty} шт</Badge>
}

function groupByVariety(products: Product[]): VarietyGroup[] {
  const map = new Map<string, VarietyGroup>()
  for (const p of products) {
    const key = p.variety_name || p.name
    if (!map.has(key)) {
      map.set(key, { variety_name: key, category: p.category, image_url: p.image_url ?? null, sizes: [] })
    } else if (!map.get(key)!.image_url && p.image_url) {
      map.get(key)!.image_url = p.image_url
    }
    map.get(key)!.sizes.push(p)
  }
  for (const g of map.values()) {
    g.sizes.sort((a, b) => (a.length_cm ?? 0) - (b.length_cm ?? 0))
  }
  return Array.from(map.values()).sort((a, b) =>
    a.variety_name.localeCompare(b.variety_name, 'ru')
  )
}

export default function PriceTable({ products: initialProducts }: { products: Product[] }) {
  const [products, setProducts] = useState(initialProducts)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState('all')
  const [showAuth, setShowAuth] = useState(false)
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null)
  const { items, add, update } = useCart()
  const { isAuthed } = useAuthStore()

  function requireAuth(action: () => void) {
    if (isAuthed) {
      action()
    } else {
      setPendingAction(() => action)
      setShowAuth(true)
    }
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
      if (available <= 0) return false
      const name = (p.variety_name || p.name).toLowerCase()
      if (search && !name.includes(search.toLowerCase())) return false
      if (tab === 'cut' && p.category !== 'cut') return false
      if (tab === 'pot' && p.category !== 'pot') return false
      return true
    })
  }, [products, search, tab])

  const groups = useMemo(() => groupByVariety(filtered), [filtered])

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 sticky top-0 z-10 bg-white py-2 border-b">
        <Input
          placeholder="Поиск по сорту..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-xs h-8 text-sm"
        />
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="h-8">
            <TabsTrigger value="all" className="text-xs px-3">Все</TabsTrigger>
            <TabsTrigger value="cut" className="text-xs px-3">Срез</TabsTrigger>
            <TabsTrigger value="pot" className="text-xs px-3">Горшечные</TabsTrigger>
          </TabsList>
        </Tabs>
        <span className="text-xs text-gray-400 ml-auto">{groups.length} сортов</span>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-xs text-gray-400">
            <th className="text-left py-2 pl-3 w-48">Сорт</th>
            <th className="text-left py-2">Размеры / Остаток / Цена</th>
          </tr>
        </thead>
        <tbody>
          {groups.map(group => (
            <tr key={group.variety_name} className="border-b hover:bg-gray-50">
              <td className="py-2 pl-3 font-medium align-top pt-3">
                <div className="flex items-center gap-2">
                  {group.image_url ? (
                    <img src={group.image_url} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                  ) : (
                    <span className="w-10 h-10 rounded-lg bg-pink-50 flex items-center justify-center text-xl flex-shrink-0 select-none">🌸</span>
                  )}
                  {group.variety_name}
                </div>
              </td>
              <td className="py-2 pr-3">
                <div className="flex flex-wrap gap-2">
                  {group.sizes.map(product => {
                    const available = getAvailable(product.stock)
                    const price = getPrice(product.stock)
                    const qty = getQty(product.id)
                    return (
                      <div key={product.id} className="flex items-center gap-2 border rounded px-2 py-1 bg-white min-w-[200px]">
                        <span className="text-xs font-mono w-12 text-gray-500">
                          {product.length_str ? product.length_str + ' см' : '—'}
                        </span>
                        <StockBadge qty={available} />
                        <span className="text-xs text-gray-500 w-16">
                          {isAuthed
                            ? `${price.toLocaleString('ru-RU')} ₸`
                            : <span className="text-gray-300 select-none">●●● ₸</span>}
                        </span>
                        <div className="flex items-center gap-1 ml-auto">
                          <button
                            className="w-6 h-6 border rounded text-xs hover:bg-gray-100 disabled:opacity-30"
                            onClick={() => requireAuth(() => update(product.id, Math.max(0, qty - (product.pack_size || 5))))}
                            disabled={qty === 0}
                          >−</button>
                          <span className="w-5 text-center text-xs">{qty}</span>
                          <button
                            className="w-6 h-6 border rounded text-xs hover:bg-gray-100 disabled:opacity-30"
                            onClick={() => requireAuth(() => {
                              const packSize = product.pack_size || 5
                              if (qty === 0) {
                                add({
                                  id: product.id,
                                  name: group.variety_name + (product.length_str ? ' ' + product.length_str : ''),
                                  price,
                                  available,
                                  category: product.category,
                                })
                                update(product.id, packSize)
                              } else {
                                update(product.id, qty + packSize)
                              }
                            })}
                            disabled={qty >= available}
                          >+</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {groups.length === 0 && (
        <div className="text-center text-gray-400 py-12">Ничего не найдено</div>
      )}

      {showAuth && (
        <PhoneAuthModal
          onClose={() => { setShowAuth(false); setPendingAction(null) }}
          onSuccess={() => { pendingAction?.() }}
        />
      )}
    </div>
  )
}

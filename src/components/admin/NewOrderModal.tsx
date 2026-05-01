'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

type Client = { id: string; name: string | null; phone: string | null }
type Product = { id: number; name: string; price: number; pack_size: number; available_qty: number }
type CartItem = Product & { qty: number }
type StockRow = { product_id: number; price: number; available_qty: number; products: { id: number; name: string; pack_size: number } | null }

export default function NewOrderModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const supabase = createClient()
  const [clients, setClients] = useState<Client[]>([])
  const [clientSearch, setClientSearch] = useState('')
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [productSearch, setProductSearch] = useState('')
  const [products, setProducts] = useState<Product[]>([])
  const [cart, setCart] = useState<CartItem[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase.from('clients').select('id, name, phone')
      .order('name').then(({ data }: { data: Client[] | null }) => setClients(data ?? []))
  }, [])

  useEffect(() => {
    if (productSearch.length < 2) { setProducts([]); return }
    supabase.from('products')
      .select('id, name, pack_size, stock_available!inner(price, available_qty)')
      .ilike('name', `%${productSearch}%`)
      .eq('is_active', true)
      .gt('stock_available.available_qty', 0)
      .limit(15)
      .then(({ data }: { data: any[] | null }) => {
        const mapped = (data ?? []).map(d => ({
          id: d.id,
          name: d.name,
          price: d.stock_available?.[0]?.price ?? 0,
          pack_size: d.pack_size ?? 1,
          available_qty: d.stock_available?.[0]?.available_qty ?? 0,
        }))
        setProducts(mapped)
      })
  }, [productSearch])

  function addToCart(product: Product) {
    setCart(prev => {
      const existing = prev.find(i => i.id === product.id)
      if (existing) return prev.map(i => i.id === product.id ? { ...i, qty: i.qty + i.pack_size } : i)
      return [...prev, { ...product, qty: product.pack_size }]
    })
    setProductSearch('')
    setProducts([])
  }

  function updateQty(id: number, qty: number) {
    if (qty <= 0) setCart(prev => prev.filter(i => i.id !== id))
    else setCart(prev => prev.map(i => i.id === id ? { ...i, qty } : i))
  }

  const total = cart.reduce((sum, i) => sum + i.qty * i.price, 0)

  async function handleCreate() {
    if (!selectedClient || !cart.length) return
    setLoading(true)
    const res = await fetch('/api/manager-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: selectedClient.id,
        items: cart.map(i => ({ id: i.id, qty: i.qty, price: i.price, name: i.name }))
      })
    })
    const data = await res.json()
    setLoading(false)
    if (data.success) { onCreated(); onClose() }
    else alert(data.error)
  }

  const filteredClients = clients.filter(c =>
    (c.name ?? '').toLowerCase().includes(clientSearch.toLowerCase()) ||
    (c.phone ?? '').includes(clientSearch)
  ).slice(0, 8)

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-4 border-b flex items-center justify-between">
          <h2 className="font-semibold text-base">Новый заказ</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        <div className="p-4 space-y-4">
          {/* Клиент */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Клиент</label>
            {selectedClient ? (
              <div className="flex items-center justify-between border rounded p-2">
                <span className="text-sm">{selectedClient.name} {selectedClient.phone}</span>
                <button onClick={() => setSelectedClient(null)} className="text-xs text-gray-400 hover:text-red-500">×</button>
              </div>
            ) : (
              <div className="space-y-1">
                <input
                  value={clientSearch}
                  onChange={e => setClientSearch(e.target.value)}
                  placeholder="Поиск по имени или телефону..."
                  className="w-full border rounded px-3 py-2 text-sm"
                />
                {clientSearch && filteredClients.map(c => (
                  <div key={c.id}
                    onClick={() => { setSelectedClient(c); setClientSearch('') }}
                    className="px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer border-b last:border-0">
                    {c.name} — {c.phone}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Товары */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Добавить товар</label>
            <input
              value={productSearch}
              onChange={e => setProductSearch(e.target.value)}
              placeholder="Поиск товара..."
              className="w-full border rounded px-3 py-2 text-sm"
            />
            {products.map(p => (
              <div key={p.id}
                onClick={() => addToCart(p)}
                className="px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer border-b flex justify-between">
                <span>{p.name}</span>
                <span className="text-gray-500">{p.price.toLocaleString('ru-RU')} T · {p.available_qty} шт</span>
              </div>
            ))}
          </div>

          {/* Корзина */}
          {cart.length > 0 && (
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Позиции заказа</label>
              <table className="w-full text-sm">
                <tbody>
                  {cart.map(item => (
                    <tr key={item.id} className="border-b">
                      <td className="py-1.5">{item.name}</td>
                      <td className="py-1.5 w-24 text-center">
                        <input type="number" value={item.qty}
                          onChange={e => updateQty(item.id, parseInt(e.target.value))}
                          min={item.pack_size} step={item.pack_size}
                          className="w-20 text-center border rounded px-1 py-0.5 text-sm" />
                      </td>
                      <td className="py-1.5 text-right text-gray-500">{item.price.toLocaleString('ru-RU')} T</td>
                      <td className="py-1.5 text-right font-medium">{(item.qty * item.price).toLocaleString('ru-RU')} T</td>
                      <td className="py-1.5 pl-2">
                        <button onClick={() => updateQty(item.id, 0)} className="text-red-400 hover:text-red-600">×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="text-right font-semibold mt-2">
                Итого: {total.toLocaleString('ru-RU')} T
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm border rounded hover:bg-gray-50">Отмена</button>
          <button
            onClick={handleCreate}
            disabled={!selectedClient || !cart.length || loading}
            className="px-4 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">
            {loading ? 'Создаю...' : 'Создать заказ'}
          </button>
        </div>
      </div>
    </div>
  )
}

'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

type Product = { id: number; name: string; price: number; pack_size: number; available_qty: number }
type CartItem = Product & { qty: number }
type Client = { id: string; name: string | null; phone: string | null }

const fmt = (n: number) => n.toLocaleString('ru-RU') + ' ₸'

export default function CashierView() {
  const supabase = createClient()
  const searchRef = useRef<HTMLInputElement>(null)

  const [productSearch, setProductSearch] = useState('')
  const [products, setProducts] = useState<Product[]>([])
  const [cart, setCart] = useState<CartItem[]>([])

  const [showCheckout, setShowCheckout] = useState(false)
  const [clients, setClients] = useState<Client[]>([])
  const [clientSearch, setClientSearch] = useState('')
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [useGuest, setUseGuest] = useState(false)
  const [guestName, setGuestName] = useState('')
  const [guestPhone, setGuestPhone] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [lastOrderId, setLastOrderId] = useState<number | null>(null)

  useEffect(() => {
    supabase.from('clients').select('id, name, phone').order('name')
      .then(({ data }: { data: Client[] | null }) => setClients(data ?? []))
  }, [])

  useEffect(() => {
    if (productSearch.length < 2) { setProducts([]); return }
    fetch(`/api/search-products?q=${encodeURIComponent(productSearch)}`)
      .then(r => r.json())
      .then(data => setProducts(data ?? []))
  }, [productSearch])

  function addToCart(product: Product) {
    setCart(prev => {
      const existing = prev.find(i => i.id === product.id)
      if (existing) return prev.map(i => i.id === product.id ? { ...i, qty: i.qty + i.pack_size } : i)
      return [...prev, { ...product, qty: product.pack_size }]
    })
    setProductSearch('')
    setProducts([])
    searchRef.current?.focus()
  }

  function updateQty(id: number, delta: number) {
    setCart(prev => prev.map(i => {
      if (i.id !== id) return i
      const next = Math.max(0, i.qty + delta)
      return { ...i, qty: next }
    }).filter(i => i.qty > 0))
  }

  const total = cart.reduce((sum, i) => sum + i.qty * i.price, 0)

  const filteredClients = clients.filter(c =>
    (c.name ?? '').toLowerCase().includes(clientSearch.toLowerCase()) ||
    (c.phone ?? '').includes(clientSearch)
  ).slice(0, 6)

  async function handleConfirm() {
    setLoading(true)
    setError('')

    const body: Record<string, unknown> = {
      items: cart.map(i => ({ id: i.id, qty: i.qty, price: i.price, name: i.name })),
      confirmed: true,
    }

    if (selectedClient) {
      body.client_id = selectedClient.id
    } else {
      body.client_id = null
      body.guest_name = guestName || null
      body.guest_phone = guestPhone || null
    }

    const res = await fetch('/api/manager-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    setLoading(false)

    if (data.success) {
      setLastOrderId(data.order_id)
      setCart([])
      setShowCheckout(false)
      setSelectedClient(null)
      setGuestName('')
      setGuestPhone('')
      setClientSearch('')
      setUseGuest(false)
    } else {
      setError(data.error ?? 'Ошибка при создании заказа')
    }
  }

  const canConfirm = !loading && (!!selectedClient || useGuest)

  return (
    <div className="flex flex-col" style={{ minHeight: 'calc(100vh - 57px)' }}>

      {/* Успешно */}
      {lastOrderId && (
        <div className="m-4 p-5 bg-green-50 border border-green-200 rounded-2xl text-center space-y-4">
          <p className="text-green-800 font-semibold text-xl">✅ Заказ #{lastOrderId} оформлен</p>
          <div className="flex gap-3 justify-center flex-wrap">
            <button
              onClick={() => window.open(`/print/order/${lastOrderId}`, '_blank', 'width=820,height=700')}
              className="px-6 py-3 bg-green-700 text-white rounded-xl text-lg font-medium hover:bg-green-800"
            >
              🖨 Печать накладной
            </button>
            <button
              onClick={() => { setLastOrderId(null); searchRef.current?.focus() }}
              className="px-6 py-3 bg-gray-200 text-gray-700 rounded-xl text-lg hover:bg-gray-300"
            >
              Новый заказ
            </button>
          </div>
        </div>
      )}

      {/* Поиск — sticky */}
      <div className="sticky top-14 z-20 bg-white border-b shadow-sm px-4 py-3">
        <input
          ref={searchRef}
          value={productSearch}
          onChange={e => setProductSearch(e.target.value)}
          placeholder="🔍 Поиск товара..."
          className="w-full border-2 border-gray-300 rounded-xl px-4 py-3 text-lg focus:outline-none focus:border-green-500 bg-gray-50"
          autoFocus
        />
      </div>

      {/* Результаты */}
      <div className="flex-1 overflow-y-auto" style={{ paddingBottom: cart.length ? '17rem' : '1rem' }}>
        {products.map(p => (
          <button
            key={p.id}
            onClick={() => addToCart(p)}
            className="w-full flex items-center justify-between px-4 py-4 border-b hover:bg-green-50 active:bg-green-100 text-left"
          >
            <div>
              <p className="text-lg font-medium leading-tight">{p.name}</p>
              <p className="text-sm text-gray-500 mt-0.5">В наличии: {p.available_qty} шт · уп. {p.pack_size}</p>
            </div>
            <div className="flex items-center gap-4 shrink-0 pl-3">
              <span className="text-base font-semibold text-gray-700">{fmt(p.price)}</span>
              <span className="w-11 h-11 flex items-center justify-center bg-green-600 text-white rounded-full text-2xl font-bold shadow">+</span>
            </div>
          </button>
        ))}

        {productSearch.length >= 2 && products.length === 0 && (
          <p className="text-center text-gray-400 py-10 text-base">Ничего не найдено</p>
        )}

        {!productSearch && cart.length === 0 && !lastOrderId && (
          <p className="text-center text-gray-300 py-20 text-lg select-none">Начните вводить название товара</p>
        )}
      </div>

      {/* Корзина — фиксированная снизу */}
      {cart.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-2xl z-30">
          <div className="max-h-44 overflow-y-auto divide-y">
            {cart.map(item => (
              <div key={item.id} className="flex items-center gap-2 px-4 py-3">
                <span className="flex-1 text-base leading-tight">{item.name}</span>
                <button
                  onClick={() => updateQty(item.id, -item.pack_size)}
                  className="w-9 h-9 flex items-center justify-center bg-gray-100 rounded-full text-xl font-bold hover:bg-gray-200 shrink-0"
                >−</button>
                <span className="w-10 text-center text-base font-semibold">{item.qty}</span>
                <button
                  onClick={() => updateQty(item.id, item.pack_size)}
                  className="w-9 h-9 flex items-center justify-center bg-gray-100 rounded-full text-xl font-bold hover:bg-gray-200 shrink-0"
                >+</button>
                <span className="w-24 text-right text-base font-medium shrink-0">{fmt(item.qty * item.price)}</span>
                <button
                  onClick={() => updateQty(item.id, -item.qty)}
                  className="text-gray-300 hover:text-red-500 text-2xl leading-none pl-1 shrink-0"
                >×</button>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
            <div>
              <p className="text-xs text-gray-400">{cart.length} поз.</p>
              <p className="text-xl font-bold">{fmt(total)}</p>
            </div>
            <button
              onClick={() => setShowCheckout(true)}
              className="px-8 py-4 bg-green-600 text-white text-lg font-semibold rounded-xl hover:bg-green-700 active:bg-green-800 shadow"
            >
              Оформить →
            </button>
          </div>
        </div>
      )}

      {/* Модал оформления */}
      {showCheckout && (
        <div className="fixed inset-0 bg-black/60 z-50" onClick={() => setShowCheckout(false)}>
          <div
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl px-5 pt-5 pb-8 space-y-4 max-h-[85vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Оформление · {fmt(total)}</h2>
              <button onClick={() => setShowCheckout(false)} className="text-gray-400 text-2xl hover:text-gray-600">×</button>
            </div>

            {!useGuest ? (
              <div className="space-y-2">
                <p className="text-sm text-gray-500 font-medium">Клиент</p>
                {selectedClient ? (
                  <div className="flex items-center justify-between border-2 border-green-500 rounded-xl px-4 py-3">
                    <span className="text-base">{selectedClient.name} · {selectedClient.phone}</span>
                    <button onClick={() => setSelectedClient(null)} className="text-gray-400 hover:text-red-500 text-2xl leading-none">×</button>
                  </div>
                ) : (
                  <>
                    <input
                      value={clientSearch}
                      onChange={e => setClientSearch(e.target.value)}
                      placeholder="Поиск по имени или телефону..."
                      className="w-full border-2 border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:border-green-500"
                      autoFocus
                    />
                    {clientSearch && (
                      <div className="border rounded-xl overflow-hidden divide-y">
                        {filteredClients.map(c => (
                          <button
                            key={c.id}
                            onClick={() => { setSelectedClient(c); setClientSearch('') }}
                            className="w-full text-left px-4 py-3 text-base hover:bg-gray-50 active:bg-gray-100"
                          >
                            {c.name} — {c.phone}
                          </button>
                        ))}
                        {filteredClients.length === 0 && (
                          <p className="px-4 py-3 text-gray-400 text-sm">Не найдено</p>
                        )}
                      </div>
                    )}
                  </>
                )}
                <button
                  onClick={() => { setUseGuest(true); setSelectedClient(null) }}
                  className="text-sm text-green-700 hover:underline pt-1"
                >
                  + Без аккаунта / новый клиент
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-gray-500 font-medium">Данные покупателя (необязательно)</p>
                <input
                  value={guestName}
                  onChange={e => setGuestName(e.target.value)}
                  placeholder="Имя"
                  className="w-full border-2 border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:border-green-500"
                  autoFocus
                />
                <input
                  value={guestPhone}
                  onChange={e => setGuestPhone(e.target.value)}
                  placeholder="Телефон"
                  className="w-full border-2 border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:border-green-500"
                />
                <button
                  onClick={() => setUseGuest(false)}
                  className="text-sm text-green-700 hover:underline"
                >
                  ← Выбрать существующего клиента
                </button>
              </div>
            )}

            {error && <p className="text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">{error}</p>}

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setShowCheckout(false)}
                className="flex-1 py-4 border-2 border-gray-300 rounded-xl text-base hover:bg-gray-50"
              >
                Отмена
              </button>
              <button
                onClick={handleConfirm}
                disabled={!canConfirm}
                className="flex-1 py-4 bg-green-600 text-white text-base font-semibold rounded-xl hover:bg-green-700 disabled:opacity-40 shadow"
              >
                {loading ? 'Оформляю...' : '✅ Подтвердить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

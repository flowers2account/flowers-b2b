'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { useAuthStore } from '@/lib/auth-store'

type Product = { id: number; name: string; price: number; pack_size: number; available_qty: number; category: string }
type CartItem = Product & { qty: number }
type Client = { id: string; name: string | null; phone: string | null; company_name?: string | null }

const fmt = (n: number) => n.toLocaleString('ru-RU') + ' ₸'
const ACCENT = '#8B3A5A'
const FERN = '#3D6B50'
const INK = '#1A1A1F'
const BORDER = '#E6DFD9'
const SOFT = '#F4EFEB'

const PAY_METHODS = [
  { id: 'cash', label: 'Нал' },
  { id: 'transfer', label: 'Перевод' },
  { id: 'terminal', label: 'Терминал' },
  { id: 'credit', label: 'Отсрочка' },
]

export default function CashierView() {
  const supabase = createClient()
  const { phone: userPhone } = useAuthStore()
  const searchRef = useRef<HTMLInputElement>(null)

  const [allProducts, setAllProducts] = useState<Product[]>([])
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [cart, setCart] = useState<CartItem[]>([])
  const [payMethod, setPayMethod] = useState('transfer')
  const [clock, setClock] = useState('')
  const [sessionOrders, setSessionOrders] = useState(0)
  const [sessionRevenue, setSessionRevenue] = useState(0)

  const [clients, setClients] = useState<Client[]>([])
  const [clientSearch, setClientSearch] = useState('')
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [showClientSearch, setShowClientSearch] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [lastOrderId, setLastOrderId] = useState<number | null>(null)

  // Clock
  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Oral' }))
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [])

  // F2 → search focus
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'F2') { e.preventDefault(); searchRef.current?.focus() } }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  // Load all available products
  useEffect(() => {
    async function load() {
      const { data: stockData } = await supabase
        .from('stock_available').select('product_id, price, available_qty').gt('available_qty', 0)
      if (!stockData?.length) return
      const ids = stockData.map((s: any) => s.product_id)
      const { data: productData } = await supabase
        .from('products').select('id, name, pack_size, category')
        .in('id', ids).eq('is_active', true).order('name')
      const stockMap = new Map(stockData.map((s: any) => [s.product_id, s]))
      setAllProducts((productData ?? []).map((p: any) => ({
        id: p.id, name: p.name, pack_size: p.pack_size ?? 1, category: p.category ?? 'cut',
        price: (stockMap.get(p.id) as any)?.price ?? 0,
        available_qty: (stockMap.get(p.id) as any)?.available_qty ?? 0,
      })))
    }
    load()
  }, [])

  // Load clients
  useEffect(() => {
    supabase.from('clients').select('id, name, phone, company_name').order('name')
      .then(({ data }: { data: Client[] | null }) => setClients(data ?? []))
  }, [])

  const filtered = allProducts.filter(p => {
    const matchCat = category === 'all' || p.category === category
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch
  })

  const inCartSet = new Set(cart.map(i => i.id))

  function tapProduct(p: Product) {
    if (p.available_qty === 0) return
    setCart(prev => {
      const ex = prev.find(i => i.id === p.id)
      if (ex) return prev.map(i => i.id === p.id ? { ...i, qty: i.qty + i.pack_size } : i)
      return [...prev, { ...p, qty: p.pack_size }]
    })
  }

  function updateQty(id: number, delta: number) {
    setCart(prev => prev.map(i => i.id !== id ? i : { ...i, qty: Math.max(0, i.qty + delta) }).filter(i => i.qty > 0))
  }

  function clearCart() {
    if (!cart.length) return
    if (!window.confirm('Очистить заказ?')) return
    setCart([]); setSelectedClient(null)
  }

  const total = cart.reduce((s, i) => s + i.qty * i.price, 0)
  const totalQty = cart.reduce((s, i) => s + i.qty, 0)

  const cats = [
    { id: 'all', label: 'Все', count: allProducts.length },
    { id: 'cut', label: '🌹 Срез', count: allProducts.filter(p => p.category === 'cut').length },
    { id: 'pot', label: '🪴 Горшечные', count: allProducts.filter(p => p.category === 'pot').length },
    { id: 'supply', label: '📦 Расходники', count: allProducts.filter(p => p.category === 'supply').length },
  ].filter(c => c.count > 0 || c.id === 'all')

  const filteredClients = clients.filter(c =>
    (c.name ?? '').toLowerCase().includes(clientSearch.toLowerCase()) || (c.phone ?? '').includes(clientSearch)
  ).slice(0, 6)

  async function handleAction(mode: 'reserve' | 'confirm') {
    if (!cart.length || loading) return
    setLoading(true); setError('')
    const res = await fetch('/api/manager-order', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: cart.map(i => ({ id: i.id, qty: i.qty, price: i.price, name: i.name })),
        confirmed: mode === 'confirm',
        client_id: selectedClient?.id ?? null,
        payment_method: payMethod,
      }),
    })
    const data = await res.json()
    setLoading(false)
    if (data.success) {
      setLastOrderId(data.order_id)
      setSessionOrders(n => n + 1)
      setSessionRevenue(r => r + total)
      if (mode === 'confirm') window.open(`/print/order/${data.order_id}`, '_blank', 'width=820,height=700')
      setCart([]); setSelectedClient(null); setClientSearch('')
    } else {
      setError(data.error ?? 'Ошибка')
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateRows: '60px 1fr', height: 'calc(100vh - 57px)', overflow: 'hidden', background: '#F6F2EF', fontFamily: "'Golos Text', -apple-system, sans-serif" }}>

      {/* ── TOPBAR ── */}
      <div style={{ background: INK, borderBottom: '1px solid #000', display: 'flex', alignItems: 'center', padding: '0 22px', gap: 18 }}>
        <Link href="/admin" style={{ height: 36, padding: '0 14px', display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.08)', color: '#fff', borderRadius: 10, fontSize: 13, fontWeight: 500, textDecoration: 'none' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="m15 18-6-6 6-6"/></svg>
          Админка
        </Link>
        <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.12)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 18, color: '#fff' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#5ED27A', boxShadow: '0 0 0 4px rgba(94,210,122,0.15)', display: 'inline-block' }} />
          Касса
        </div>
        <div style={{ display: 'flex', gap: 24, marginLeft: 'auto' }}>
          {[
            { l: 'Заказов', v: String(sessionOrders), color: '#fff' },
            { l: 'Выручка', v: sessionRevenue > 0 ? fmt(sessionRevenue) : '—', color: '#F7BFA0' },
            { l: 'Товаров', v: String(allProducts.length), color: '#86E59E' },
          ].map(s => (
            <div key={s.l} style={{ display: 'flex', flexDirection: 'column', gap: 1, lineHeight: 1.1 }}>
              <span style={{ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', fontWeight: 500 }}>{s.l}</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: s.color, fontVariantNumeric: 'tabular-nums' }}>{s.v}</span>
            </div>
          ))}
        </div>
        <div style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 600, padding: '8px 14px', background: 'rgba(255,255,255,0.08)', borderRadius: 10, letterSpacing: '0.04em', color: '#fff' }}>
          {clock}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 12px 5px 5px', background: 'rgba(255,255,255,0.08)', borderRadius: 999 }}>
          <span style={{ width: 30, height: 30, borderRadius: '50%', background: ACCENT, color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {userPhone ? userPhone.slice(-2) : '??'}
          </span>
          <span style={{ fontSize: 13, color: '#fff', fontWeight: 500 }}>Кассир</span>
        </div>
      </div>

      {/* ── BODY ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 460px', overflow: 'hidden' }}>

        {/* LEFT: product picker */}
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '16px 16px 16px 20px', gap: 12 }}>

          {/* Search bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: '#fff', border: `2px solid ${BORDER}`, borderRadius: 14 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#A8A4AD" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Найти товар…"
              autoFocus
              style={{ border: 'none', background: 'none', outline: 'none', flex: 1, fontFamily: 'inherit', fontSize: 16, color: INK, fontWeight: 500 }}
            />
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#7A7780' }}>
              <kbd style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 600, padding: '3px 7px', background: SOFT, border: `1px solid ${BORDER}`, borderRadius: 6, boxShadow: `0 1px 0 ${BORDER}` }}>F2</kbd>
              фокус
            </span>
          </div>

          {/* Category tabs */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {cats.map(tab => (
              <button key={tab.id} onClick={() => setCategory(tab.id)} style={{
                display: 'inline-flex', alignItems: 'center', gap: 8, height: 40, padding: '0 16px',
                background: category === tab.id ? INK : '#fff',
                border: `1px solid ${category === tab.id ? INK : BORDER}`,
                borderRadius: 999, fontFamily: 'inherit', fontSize: 13,
                fontWeight: category === tab.id ? 600 : 500,
                color: category === tab.id ? '#fff' : '#494950', cursor: 'pointer',
              }}>
                {tab.label}
                <span style={{ fontFamily: 'monospace', fontSize: 10, fontWeight: 600, padding: '2px 6px', background: category === tab.id ? 'rgba(255,255,255,0.15)' : SOFT, color: category === tab.id ? '#fff' : '#7A7780', borderRadius: 999 }}>{tab.count}</span>
              </button>
            ))}
          </div>

          {/* Product grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, overflowY: 'auto', flex: 1, alignContent: 'flex-start', paddingBottom: 8 }}>
            {filtered.map(p => {
              const inCart = inCartSet.has(p.id)
              const isLow = p.available_qty > 0 && p.available_qty < 50
              const isOut = p.available_qty === 0
              const cartItem = cart.find(i => i.id === p.id)
              return (
                <button key={p.id} onClick={() => tapProduct(p)} disabled={isOut} style={{
                  background: '#fff',
                  border: inCart ? `2px solid ${ACCENT}` : `1px solid #EFEAE5`,
                  borderRadius: 12, overflow: 'hidden', cursor: isOut ? 'default' : 'pointer',
                  display: 'flex', flexDirection: 'column',
                  boxShadow: inCart ? `0 0 0 3px #F7EEF2` : '0 1px 2px rgba(40,20,30,0.04)',
                  position: 'relative', opacity: isOut ? 0.5 : 1, textAlign: 'left',
                  transition: 'transform 0.1s',
                }}>
                  <div style={{ aspectRatio: '1', background: SOFT, position: 'relative', display: 'flex', alignItems: 'flex-end' }}>
                    <span style={{
                      position: 'absolute', top: 7, left: 7,
                      background: isOut ? 'rgba(180,56,56,0.85)' : 'rgba(26,26,31,0.78)',
                      color: '#fff', fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                    }}>
                      {!isOut && <span style={{ width: 4, height: 4, borderRadius: '50%', background: isLow ? '#F2A93B' : '#5ED27A', display: 'inline-block' }} />}
                      {isOut ? 'нет' : `${p.available_qty}`}
                    </span>
                    {inCart && (
                      <span style={{ position: 'absolute', top: 7, right: 7, width: 24, height: 24, borderRadius: '50%', background: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(139,58,90,0.3)' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      </span>
                    )}
                    {inCart && cartItem && (
                      <span style={{ position: 'absolute', bottom: 6, right: 8, fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: ACCENT }}>{cartItem.qty} шт</span>
                    )}
                  </div>
                  <div style={{ padding: '9px 10px', display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.2, color: INK, letterSpacing: '-0.005em' }}>{p.name}</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 3 }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: ACCENT }}>{p.price.toLocaleString('ru-RU')} ₸</span>
                      <span style={{ fontSize: 10, color: '#7A7780' }}>уп.{p.pack_size}</span>
                    </div>
                  </div>
                </button>
              )
            })}
            {filtered.length === 0 && (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 40, color: '#A8A4AD', fontSize: 14 }}>
                {search ? 'Ничего не найдено' : 'Нет доступных товаров'}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: order builder */}
        <div style={{ background: '#fff', borderLeft: `1px solid #EFEAE5`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Header */}
          <div style={{ padding: '14px 20px', borderBottom: `1px solid #EFEAE5`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 500, letterSpacing: '-0.01em', color: INK, lineHeight: 1 }}>Заказ</div>
              {lastOrderId && <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#7A7780', marginTop: 4, letterSpacing: '0.04em' }}>Последний: #{lastOrderId} · <button onClick={() => window.open(`/print/order/${lastOrderId}`, '_blank', 'width=820,height=700')} style={{ fontFamily: 'monospace', fontSize: 11, color: ACCENT, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>печать</button></div>}
            </div>
            <button onClick={clearCart} disabled={!cart.length} style={{ height: 34, padding: '0 12px', background: 'none', border: `1px solid ${BORDER}`, color: '#494950', borderRadius: 10, fontFamily: 'inherit', fontSize: 12, fontWeight: 500, cursor: cart.length ? 'pointer' : 'default', display: 'inline-flex', alignItems: 'center', gap: 6, opacity: cart.length ? 1 : 0.35 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              Очистить
            </button>
          </div>

          {/* Customer */}
          <div style={{ padding: '12px 20px', borderBottom: `1px solid #EFEAE5`, background: SOFT }}>
            <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#7A7780', fontWeight: 500, marginBottom: 8 }}>Покупатель</div>
            {selectedClient ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 10 }}>
                <span style={{ width: 36, height: 36, borderRadius: '50%', background: ACCENT, color: '#fff', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {(selectedClient.name ?? '?')[0]?.toUpperCase()}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: INK }}>{selectedClient.company_name || selectedClient.name}</div>
                  {selectedClient.phone && <div style={{ fontSize: 11, color: '#7A7780', marginTop: 1, fontFamily: 'monospace' }}>{selectedClient.phone}</div>}
                </div>
                <button onClick={() => { setSelectedClient(null); setShowClientSearch(true) }} style={{ width: 30, height: 30, borderRadius: 6, border: `1px solid ${BORDER}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                </button>
              </div>
            ) : showClientSearch ? (
              <div>
                <input value={clientSearch} onChange={e => setClientSearch(e.target.value)} placeholder="Поиск по имени или телефону..." autoFocus
                  style={{ width: '100%', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 12px', fontFamily: 'inherit', fontSize: 13, outline: 'none', background: '#fff' }} />
                {clientSearch && (
                  <div style={{ marginTop: 4, border: `1px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden', background: '#fff', maxHeight: 180, overflowY: 'auto' }}>
                    {filteredClients.map(c => (
                      <button key={c.id} onClick={() => { setSelectedClient(c); setClientSearch(''); setShowClientSearch(false) }}
                        style={{ width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 13, background: 'none', border: 'none', borderBottom: `1px solid #EFEAE5`, cursor: 'pointer', fontFamily: 'inherit' }}>
                        {c.name}{c.company_name ? ` · ${c.company_name}` : ''} — {c.phone}
                      </button>
                    ))}
                    {!filteredClients.length && <div style={{ padding: '8px 12px', fontSize: 12, color: '#A8A4AD' }}>Не найдено</div>}
                  </div>
                )}
                <button onClick={() => setShowClientSearch(false)} style={{ marginTop: 6, fontSize: 12, color: '#7A7780', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Отмена</button>
              </div>
            ) : (
              <button onClick={() => setShowClientSearch(true)} style={{ width: '100%', padding: '10px 12px', background: '#fff', border: `1px dashed ${BORDER}`, borderRadius: 10, color: '#A8A4AD', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left' }}>
                + Выбрать покупателя
              </button>
            )}
          </div>

          {/* Items list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 20px' }}>
            {cart.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: '#A8A4AD', minHeight: 200, textAlign: 'center' }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
                <span style={{ fontSize: 13 }}>Нажмите на плитку товара, чтобы добавить</span>
              </div>
            ) : cart.map(item => (
              <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '42px 1fr auto', gap: 10, alignItems: 'center', padding: '10px 0', borderBottom: '1px dashed #EFEAE5' }}>
                <div style={{ width: 42, height: 42, borderRadius: 8, background: SOFT, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 14, lineHeight: 1.2, color: INK, fontWeight: 500 }}>{item.name}</div>
                  <div style={{ fontSize: 11, color: '#7A7780', marginTop: 2 }}>{item.price.toLocaleString('ru-RU')} ₸/шт · уп.{item.pack_size}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: INK, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{(item.qty * item.price).toLocaleString('ru-RU')} ₸</span>
                  <div style={{ display: 'flex', alignItems: 'center', border: `1px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden', height: 30 }}>
                    <button onClick={() => updateQty(item.id, -item.pack_size)} style={{ width: 30, height: 30, border: 'none', background: SOFT, color: ACCENT, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>−</button>
                    <span style={{ width: 38, textAlign: 'center', fontSize: 12, fontWeight: 600, color: INK, borderLeft: `1px solid ${BORDER}`, borderRight: `1px solid ${BORDER}`, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontVariantNumeric: 'tabular-nums' }}>{item.qty}</span>
                    <button onClick={() => updateQty(item.id, item.pack_size)} style={{ width: 30, height: 30, border: 'none', background: SOFT, color: ACCENT, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>+</button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{ background: SOFT, borderTop: `1px solid #EFEAE5`, padding: '14px 20px 18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#494950', padding: '4px 0' }}>
              <span>Позиций</span><span>{cart.length} · {totalQty} шт</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '8px 0', marginTop: 4, borderTop: `1px solid ${BORDER}` }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: INK }}>К оплате</span>
              <span style={{ fontSize: 30, fontWeight: 700, color: ACCENT, letterSpacing: '-0.02em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{fmt(total)}</span>
            </div>

            {/* Payment method */}
            <div style={{ marginTop: 10, display: 'flex', gap: 4, padding: '6px 10px', background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 10 }}>
              {PAY_METHODS.map(m => (
                <button key={m.id} onClick={() => setPayMethod(m.id)} style={{ flex: 1, textAlign: 'center', padding: '6px 4px', borderRadius: 6, fontSize: 12, fontWeight: 600, color: payMethod === m.id ? '#fff' : '#7A7780', background: payMethod === m.id ? INK : 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}>
                  {m.label}
                </button>
              ))}
            </div>

            {error && <div style={{ marginTop: 8, fontSize: 12, color: '#B43838', background: '#FBECEC', border: '1px solid rgba(180,56,56,0.2)', borderRadius: 8, padding: '8px 12px' }}>{error}</div>}

            {/* Actions */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
              <button onClick={() => handleAction('reserve')} disabled={!cart.length || loading} style={{ height: 52, border: `1px solid ${BORDER}`, borderRadius: 10, background: '#fff', color: INK, fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: cart.length ? 'pointer' : 'default', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, opacity: cart.length ? 1 : 0.35 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                Резерв 30 мин
              </button>
              <button onClick={() => handleAction('confirm')} disabled={!cart.length || loading} style={{ height: 52, border: 'none', borderRadius: 10, background: `linear-gradient(180deg, ${FERN} 0%, #2E5640 100%)`, color: '#fff', fontFamily: 'inherit', fontSize: 14, fontWeight: 600, cursor: cart.length ? 'pointer' : 'default', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, boxShadow: '0 4px 12px rgba(61,107,80,0.3), inset 0 1px 0 rgba(255,255,255,0.15)', opacity: cart.length ? 1 : 0.35 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                {loading ? 'Оформляю...' : 'Подтвердить и печать'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

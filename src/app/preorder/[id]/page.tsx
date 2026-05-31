'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { checkoutPreorder } from '@/app/admin/preorder-actions'

interface RoomItem {
  id: number
  product_id: number
  price: number
  pack_size: number
  min_qty: number
  oz_delivery_date: string | null
  oz_stock_type: string | null
  oz_available_stems: number | null
  name: string
  display_name: string | null
  image_url: string | null
}

interface CartItem {
  campaign_item_id: number
  label: string
  price: number
  qty: number
  pack_size: number
  available: number | null
}

type Phase = 'checking' | 'join' | 'pending' | 'room' | 'checkout' | 'ordered'

function fmtDate(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('ru-RU', { timeZone: 'Asia/Oral', day: 'numeric', month: 'short' })
}

export default function PreorderRoomPage() {
  const { id } = useParams<{ id: string }>()
  const supabase = createClient()
  const COOKIE_KEY = `preorder_token_${id}`

  const [phase, setPhase]    = useState<Phase>('checking')
  const [items, setItems]    = useState<RoomItem[]>([])
  const [title, setTitle]    = useState('')
  const [code, setCode]      = useState('')
  const [phone, setPhone]    = useState('')
  const [guestName, setName] = useState('')
  const [error, setError]    = useState('')
  const pollRef              = useRef<ReturnType<typeof setInterval> | null>(null)

  // Cart state — in-memory only (no localStorage)
  const [cart, setCart]         = useState<CartItem[]>([])
  const [submitting, setSubmit] = useState(false)
  const [orderId, setOrderId]   = useState<number | null>(null)
  const [orderTotal, setOrderTotal] = useState(0)

  function getCookie(key: string) {
    return document.cookie.split('; ').find(r => r.startsWith(key + '='))?.split('=')[1] ?? null
  }

  function setCookie(key: string, value: string, days = 7) {
    const exp = new Date(Date.now() + days * 864e5).toUTCString()
    document.cookie = `${key}=${value}; expires=${exp}; path=/; SameSite=Strict`
  }

  async function loadRoom(token: string) {
    const { data: rows } = await supabase
      .rpc('get_preorder_room', { p_campaign_id: parseInt(id), p_token: token })

    if (!rows?.length) { setPhase('join'); return }

    const { data: campaign } = await supabase
      .from('campaigns').select('title').eq('id', parseInt(id)).single()

    setTitle(campaign?.title ?? 'Предзаказ')
    setItems(rows as RoomItem[])
    setPhase('room')
  }

  useEffect(() => {
    const savedToken = getCookie(COOKIE_KEY)
    if (savedToken) { loadRoom(savedToken) }
    else { setPhase('join') }
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [id])

  function startPolling(phone: string) {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      const res = await fetch(`/api/preorder/${id}/status?phone=${encodeURIComponent(phone)}`)
      const data = await res.json()
      if (data.status === 'approved' && data.access_token) {
        clearInterval(pollRef.current!)
        setCookie(COOKIE_KEY, data.access_token)
        loadRoom(data.access_token)
      } else if (data.status === 'denied') {
        clearInterval(pollRef.current!)
        setError('Менеджер отклонил запрос доступа.')
        setPhase('join')
      }
    }, 5000)
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const res = await fetch(`/api/preorder/${id}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code.trim().toUpperCase(), phone, name: guestName }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error ?? 'Ошибка'); return }
    setPhase('pending')
    startPolling(phone)
  }

  // ── Cart helpers ────────────────────────────────────────────────────────────

  function getQty(itemId: number) {
    return cart.find(c => c.campaign_item_id === itemId)?.qty ?? 0
  }

  function setQty(item: RoomItem, newQty: number) {
    const label = item.display_name ?? item.name
    const min = item.min_qty ?? item.pack_size
    if (newQty < min) {
      // Remove from cart
      setCart(c => c.filter(i => i.campaign_item_id !== item.id))
      return
    }
    const max = item.oz_available_stems
    const clamped = max !== null ? Math.min(newQty, max) : newQty
    setCart(c => {
      const exists = c.find(i => i.campaign_item_id === item.id)
      if (exists) return c.map(i => i.campaign_item_id === item.id ? { ...i, qty: clamped } : i)
      return [...c, { campaign_item_id: item.id, label, price: item.price, qty: clamped, pack_size: item.pack_size, available: item.oz_available_stems }]
    })
  }

  const cartTotal = cart.reduce((s, i) => s + i.price * i.qty, 0)

  async function handleCheckout() {
    setSubmit(true)
    setError('')
    const result = await checkoutPreorder({
      campaign_id: parseInt(id),
      items: cart.map(i => ({ campaign_item_id: i.campaign_item_id, qty: i.qty })),
    })
    setSubmit(false)
    if (result.error) { setError(result.error); return }
    setOrderId(result.order_id ?? null)
    setOrderTotal(result.total ?? 0)
    setCart([])
    setPhase('ordered')
  }

  // ── Renders ─────────────────────────────────────────────────────────────────

  if (phase === 'checking') return (
    <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Проверка доступа…</div>
  )

  if (phase === 'pending') return (
    <div style={{ maxWidth: 400, margin: '80px auto', padding: 32, textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
      <h2 style={{ marginBottom: 8 }}>Запрос отправлен</h2>
      <p style={{ color: '#666', fontSize: 14 }}>
        Ожидайте подтверждения от менеджера — страница обновится автоматически.
      </p>
    </div>
  )

  if (phase === 'join') return (
    <div style={{ maxWidth: 380, margin: '80px auto', padding: 32 }}>
      <h1 style={{ marginBottom: 4, fontSize: 22 }}>Закрытый предзаказ</h1>
      <p style={{ color: '#666', marginBottom: 24, fontSize: 14 }}>
        Введите код доступа, полученный от менеджера
      </p>
      <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input
          placeholder="Код входа (6 символов)"
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase())}
          maxLength={6}
          required
          style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #ddd', fontSize: 18, letterSpacing: 4, textTransform: 'uppercase', textAlign: 'center' }}
        />
        <input
          placeholder="Ваш телефон"
          value={phone}
          onChange={e => setPhone(e.target.value)}
          required
          style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14 }}
        />
        <input
          placeholder="Ваше имя / компания"
          value={guestName}
          onChange={e => setName(e.target.value)}
          style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14 }}
        />
        {error && <p style={{ color: '#e53e3e', fontSize: 13 }}>{error}</p>}
        <button
          type="submit"
          style={{ padding: 12, borderRadius: 8, background: '#2d6a4f', color: '#fff', border: 'none', fontSize: 15, cursor: 'pointer' }}
        >
          Запросить доступ
        </button>
      </form>
    </div>
  )

  if (phase === 'ordered') return (
    <div style={{ maxWidth: 480, margin: '80px auto', padding: 32, textAlign: 'center' }}>
      <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
      <h2 style={{ fontSize: 22, marginBottom: 8 }}>Предзаказ оформлен!</h2>
      {orderId && <p style={{ color: '#666', fontSize: 13, marginBottom: 4 }}>Заказ #{orderId}</p>}
      <p style={{ fontSize: 18, fontWeight: 700, color: '#2d6a4f', marginBottom: 16 }}>
        {orderTotal.toLocaleString('ru-RU')} ₸
      </p>
      <p style={{ color: '#666', fontSize: 14, marginBottom: 24 }}>
        Ожидайте звонка менеджера для подтверждения поставки.
      </p>
      <button
        onClick={() => setPhase('room')}
        style={{ padding: '10px 24px', borderRadius: 8, background: '#f5f5f5', border: 'none', fontSize: 14, cursor: 'pointer' }}
      >
        ← Назад к витрине
      </button>
    </div>
  )

  // ── Checkout confirmation screen ─────────────────────────────────────────────

  if (phase === 'checkout') return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: 24 }}>
      <button onClick={() => setPhase('room')} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', marginBottom: 16, fontSize: 13 }}>
        ← Изменить
      </button>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>Ваш предзаказ</h2>

      <div style={{ border: '1px solid #eee', borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
        {cart.map((item, i) => (
          <div key={item.campaign_item_id} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '12px 16px',
            borderBottom: i < cart.length - 1 ? '1px solid #f5f5f5' : 'none',
          }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{item.label}</div>
              <div style={{ fontSize: 12, color: '#aaa' }}>{item.qty} стеблей × {item.price.toLocaleString('ru-RU')} ₸</div>
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#2d6a4f' }}>
              {(item.qty * item.price).toLocaleString('ru-RU')} ₸
            </div>
          </div>
        ))}
        <div style={{ padding: '12px 16px', background: '#f9f9f9', display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 15 }}>
          <span>Итого</span>
          <span style={{ color: '#2d6a4f' }}>{cartTotal.toLocaleString('ru-RU')} ₸</span>
        </div>
      </div>

      {error && <p style={{ color: '#e53e3e', fontSize: 13, marginBottom: 12 }}>{error}</p>}

      <button
        onClick={handleCheckout}
        disabled={submitting}
        style={{
          width: '100%', padding: '14px', borderRadius: 10,
          background: submitting ? '#aaa' : '#2d6a4f', color: '#fff', border: 'none',
          fontSize: 16, fontWeight: 600, cursor: submitting ? 'default' : 'pointer',
        }}
      >
        {submitting ? 'Оформляем…' : '✅ Подтвердить предзаказ'}
      </button>
    </div>
  )

  // ── Room vitrine ─────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px', paddingBottom: cart.length > 0 ? 96 : 24 }}>
      <h1 style={{ marginBottom: 4, fontSize: 22 }}>{title}</h1>
      <p style={{ color: '#666', marginBottom: 24, fontSize: 13 }}>Закрытая витрина · {items.length} позиций</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
        {items.map(item => {
          const qty = getQty(item.id)
          const inCart = qty > 0
          const max = item.oz_available_stems
          const canInc = max === null || qty + item.pack_size <= max

          return (
            <div key={item.id} style={{
              border: `1px solid ${inCart ? '#2d6a4f' : '#eee'}`,
              borderRadius: 12, overflow: 'hidden',
              boxShadow: inCart ? '0 0 0 2px #2d6a4f20' : 'none',
            }}>
              {item.image_url
                ? <img src={item.image_url} alt={item.display_name ?? item.name} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover' }} />
                : <div style={{ width: '100%', aspectRatio: '1', background: '#f5f5f5' }} />
              }
              <div style={{ padding: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2, lineHeight: 1.3 }}>
                  {item.display_name ?? item.name}
                </div>
                {item.oz_delivery_date && (
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>
                    Поставка: {fmtDate(item.oz_delivery_date)}
                  </div>
                )}
                <div style={{ fontSize: 15, fontWeight: 700, color: '#2d6a4f', marginBottom: 2 }}>
                  {item.price.toLocaleString('ru-RU')} ₸/стебель
                </div>
                <div style={{ fontSize: 11, color: '#aaa', marginBottom: 10 }}>
                  кратность {item.pack_size} шт
                  {max !== null && ` · доступно ${max}`}
                </div>

                {inCart ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      onClick={() => setQty(item, qty - item.pack_size)}
                      style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #ddd', background: '#fff', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >−</button>
                    <span style={{ flex: 1, textAlign: 'center', fontWeight: 700, fontSize: 14 }}>{qty}</span>
                    <button
                      onClick={() => setQty(item, qty + item.pack_size)}
                      disabled={!canInc}
                      style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #ddd', background: canInc ? '#fff' : '#f5f5f5', fontSize: 18, cursor: canInc ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: canInc ? 1 : 0.4 }}
                    >+</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setQty(item, item.min_qty ?? item.pack_size)}
                    style={{ width: '100%', padding: '8px', borderRadius: 8, background: '#2d6a4f', color: '#fff', border: 'none', fontSize: 13, cursor: 'pointer' }}
                  >
                    В корзину
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Sticky cart bar */}
      {cart.length > 0 && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: '#2d6a4f', color: '#fff',
          padding: '14px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          boxShadow: '0 -2px 16px rgba(0,0,0,0.15)',
          zIndex: 100,
        }}>
          <div style={{ fontSize: 14 }}>
            <span style={{ fontWeight: 700 }}>{cart.length}</span>
            {' '}поз. · {' '}
            <span style={{ fontWeight: 700 }}>{cartTotal.toLocaleString('ru-RU')} ₸</span>
          </div>
          <button
            onClick={() => setPhase('checkout')}
            style={{
              padding: '8px 24px', borderRadius: 8,
              background: '#fff', color: '#2d6a4f',
              border: 'none', fontWeight: 700, fontSize: 14, cursor: 'pointer',
            }}
          >
            Оформить →
          </button>
        </div>
      )}
    </div>
  )
}

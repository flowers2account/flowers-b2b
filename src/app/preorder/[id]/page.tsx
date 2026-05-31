'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

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

type Phase = 'checking' | 'join' | 'pending' | 'room'

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

    if (!rows?.length) {
      // Token invalid or no items → back to join
      setPhase('join')
      return
    }

    // Load campaign title separately (public field)
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('title')
      .eq('id', parseInt(id))
      .single()

    setTitle(campaign?.title ?? 'Предзаказ')
    setItems(rows as RoomItem[])
    setPhase('room')
  }

  useEffect(() => {
    const savedToken = getCookie(COOKIE_KEY)
    if (savedToken) {
      loadRoom(savedToken)
    } else {
      setPhase('join')
    }
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

  // ── Render ────────────────────────────────────────────────────────────────────

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

  // room phase
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
      <h1 style={{ marginBottom: 4, fontSize: 22 }}>{title}</h1>
      <p style={{ color: '#666', marginBottom: 24, fontSize: 13 }}>Закрытая витрина · {items.length} позиций</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
        {items.map(item => (
          <div key={item.id} style={{ border: '1px solid #eee', borderRadius: 12, overflow: 'hidden' }}>
            {item.image_url
              ? <img src={item.image_url} alt={item.display_name ?? item.name} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover' }} />
              : <div style={{ width: '100%', aspectRatio: '1', background: '#f5f5f5' }} />
            }
            <div style={{ padding: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>
                {item.display_name ?? item.name}
              </div>
              {item.oz_delivery_date && (
                <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>
                  Поставка: {new Date(item.oz_delivery_date).toLocaleDateString('ru-RU', { timeZone: 'Asia/Oral' })}
                </div>
              )}
              <div style={{ fontSize: 15, fontWeight: 700, color: '#2d6a4f' }}>
                {item.price.toLocaleString('ru-RU')} ₸/стебель
              </div>
              <div style={{ fontSize: 11, color: '#aaa' }}>кратность {item.pack_size} шт</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

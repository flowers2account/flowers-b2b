'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface CampaignItem {
  id: number
  product_id: number
  price: number
  pack_size: number
  min_qty: number
  oz_delivery_date: string | null
  oz_available_stems: number | null
  oz_stock_type: string | null
  products: {
    name: string
    display_name: string | null
    image_url: string | null
    subcategory: string | null
  }
}

export default function PreorderRoomPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()

  const [phase, setPhase]     = useState<'checking' | 'join' | 'pending' | 'room'>('checking')
  const [items, setItems]     = useState<CampaignItem[]>([])
  const [title, setTitle]     = useState('')
  const [code, setCode]       = useState('')
  const [phone, setPhone]     = useState('')
  const [guestName, setName]  = useState('')
  const [error, setError]     = useState('')
  const [token, setToken]     = useState<string | null>(null)

  const COOKIE_KEY = `preorder_token_${id}`

  useEffect(() => {
    const saved = document.cookie.split('; ').find(r => r.startsWith(COOKIE_KEY + '='))
    const savedToken = saved?.split('=')[1] ?? null
    if (savedToken) {
      setToken(savedToken)
      loadRoom(savedToken)
    } else {
      setPhase('join')
    }
  }, [id])

  async function loadRoom(tok: string) {
    // Verify token against campaign_access
    const { data: access } = await supabase
      .from('campaign_access')
      .select('status')
      .eq('campaign_id', parseInt(id))
      .eq('access_token', tok)
      .eq('status', 'approved')
      .maybeSingle()

    if (!access) { setPhase('join'); return }

    const { data: campaign } = await supabase
      .from('campaigns')
      .select('title, campaign_items(id, product_id, price, pack_size, min_qty, oz_delivery_date, oz_available_stems, oz_stock_type, products(name, display_name, image_url, subcategory))')
      .eq('id', parseInt(id))
      .single()

    if (campaign) {
      setTitle(campaign.title)
      setItems((campaign as any).campaign_items ?? [])
    }
    setPhase('room')
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const res = await fetch(`/api/preorder/${id}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code.toUpperCase(), phone, name: guestName }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error ?? 'Ошибка'); return }
    setPhase('pending')
  }

  if (phase === 'checking') return <div style={{ padding: 40, textAlign: 'center' }}>Проверка доступа…</div>

  if (phase === 'pending') return (
    <div style={{ maxWidth: 400, margin: '80px auto', padding: 32, textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
      <h2 style={{ marginBottom: 8 }}>Запрос отправлен</h2>
      <p style={{ color: '#666' }}>Ожидайте подтверждения от менеджера. Как только вас впустят, вы получите уведомление.</p>
    </div>
  )

  if (phase === 'join') return (
    <div style={{ maxWidth: 380, margin: '80px auto', padding: 32 }}>
      <h1 style={{ marginBottom: 4, fontSize: 22 }}>Закрытый предзаказ</h1>
      <p style={{ color: '#666', marginBottom: 24, fontSize: 14 }}>Введите код доступа, полученный от менеджера</p>
      <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input
          placeholder="Код входа (6 символов)"
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase())}
          maxLength={6}
          required
          style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #ddd', fontSize: 16, letterSpacing: 3, textTransform: 'uppercase' }}
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
        <button type="submit" style={{ padding: '12px', borderRadius: 8, background: '#2d6a4f', color: '#fff', border: 'none', fontSize: 15, cursor: 'pointer' }}>
          Запросить доступ
        </button>
      </form>
    </div>
  )

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
      <h1 style={{ marginBottom: 4, fontSize: 22 }}>{title || 'Предзаказ'}</h1>
      <p style={{ color: '#666', marginBottom: 24, fontSize: 13 }}>Закрытая витрина · {items.length} позиций</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
        {items.map(item => (
          <div key={item.id} style={{ border: '1px solid #eee', borderRadius: 12, overflow: 'hidden' }}>
            {item.products?.image_url
              ? <img src={item.products.image_url} alt={item.products.display_name ?? item.products.name} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover' }} />
              : <div style={{ width: '100%', aspectRatio: '1', background: '#f5f5f5' }} />
            }
            <div style={{ padding: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>
                {item.products?.display_name ?? item.products?.name}
              </div>
              {item.oz_delivery_date && (
                <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>
                  Поставка: {new Date(item.oz_delivery_date).toLocaleDateString('ru-RU')}
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

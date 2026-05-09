'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useAuthStore } from '@/lib/auth-store'
import { normalizePhone } from '@/lib/phone'
import { COLORS } from '@/lib/colors'
import type { Campaign, CampaignStats } from '@/types/campaigns'

type ProductData = {
  id: number
  name: string
  variety_name: string | null
  length_str: string | null
  image_url: string | null
  category: string
  color: string | null
  colors: string[] | null
  floral_role: string | null
  origin: string | null
}

type CampaignItemFull = {
  id: number
  campaign_id: number
  product_id: number
  price: number
  min_qty: number
  pack_size: number
  notes: string | null
  sort_order: number
  is_active: boolean
  product?: ProductData
}

type PageData = {
  campaign: Campaign
  items: CampaignItemFull[]
  stats: CampaignStats
}

const TYPE_LABELS: Record<string, string> = {
  europe: 'Европа',
  china: 'Китай',
}

function useCountdown(target: string | undefined) {
  const [diff, setDiff] = useState(0)

  useEffect(() => {
    if (!target) return
    const update = () => setDiff(new Date(target).getTime() - Date.now())
    update()
    const id = setInterval(update, 30_000)
    return () => clearInterval(id)
  }, [target])

  const total = Math.max(0, Math.floor(diff / 1000))
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    expired: diff <= 0,
  }
}

type CartState = Record<number, number>

type ExistingOrder = {
  id: number
  status: string
  total: number
  items_count: number
  items: { campaign_item_id: number; qty: number; price: number }[]
} | null

export default function CampaignDetailPage() {
  const { id } = useParams()
  const { user, isAuthed, init } = useAuthStore()

  const [data, setData] = useState<PageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const [cart, setCart] = useState<CartState>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [orderError, setOrderError] = useState<string | null>(null)
  const [showGuestForm, setShowGuestForm] = useState(false)
  const [guestName, setGuestName] = useState('')
  const [guestPhone, setGuestPhone] = useState('')

  const [existingOrder, setExistingOrder] = useState<ExistingOrder>(null)
  const [cancellingOrder, setCancellingOrder] = useState(false)

  useEffect(() => {
    init()
    fetch(`/api/campaigns/${id}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setFetchError(d.error)
        else setData(d)
      })
      .catch(() => setFetchError('Не удалось загрузить кампанию'))
      .finally(() => setLoading(false))
  }, [id, init])

  // Проверяем существующий предзаказ после авторизации
  useEffect(() => {
    if (!user || !id) return
    fetch(`/api/campaigns/${id}/order?client_id=${user.id}`)
      .then(r => r.json())
      .then(d => {
        if (d.order) setExistingOrder(d.order)
      })
      .catch(() => {})
  }, [user?.id, id])

  const loadOrderIntoCart = () => {
    if (!existingOrder) return
    const newCart: CartState = {}
    existingOrder.items.forEach(item => {
      newCart[item.campaign_item_id] = item.qty
    })
    setCart(newCart)
    setSubmitted(false)
    setExistingOrder(null)
    // Скроллим к каталогу
    document.getElementById('campaign-catalog')?.scrollIntoView({ behavior: 'smooth' })
  }

  const cancelExistingOrder = async () => {
    if (!existingOrder || !user || !confirm('Отменить предзаказ?')) return
    setCancellingOrder(true)
    try {
      const res = await fetch(`/api/campaigns/${id}/order?client_id=${user.id}`, { method: 'DELETE' })
      if (res.ok) setExistingOrder(null)
    } catch {}
    setCancellingOrder(false)
  }

  const countdown = useCountdown(data?.campaign?.closes_at)

  const increment = (item: CampaignItemFull) => {
    setCart(prev => {
      const cur = prev[item.id] ?? 0
      return { ...prev, [item.id]: cur === 0 ? item.min_qty : cur + item.pack_size }
    })
  }

  const decrement = (item: CampaignItemFull) => {
    setCart(prev => {
      const cur = prev[item.id] ?? 0
      const next = cur - item.pack_size
      return { ...prev, [item.id]: Math.max(0, next) }
    })
  }

  const cartItems = (data?.items ?? []).filter(item => (cart[item.id] ?? 0) > 0)
  const cartTotal = cartItems.reduce((sum, item) => sum + item.price * (cart[item.id] ?? 0), 0)
  const cartCount = cartItems.reduce((sum, item) => sum + (cart[item.id] ?? 0), 0)

  const handleSubmit = async () => {
    if (!isAuthed && !showGuestForm) {
      setShowGuestForm(true)
      return
    }
    if (!isAuthed && (!guestName.trim() || !guestPhone.trim())) {
      setOrderError('Введите имя и номер телефона')
      return
    }
    if (cartItems.length === 0) return

    setSubmitting(true)
    setOrderError(null)

    const body: Record<string, unknown> = {
      items: cartItems.map(item => ({
        campaign_item_id: item.id,
        qty: cart[item.id],
        price: item.price,
      })),
    }

    if (isAuthed && user) {
      body.client_id = user.id
    } else {
      body.guest_phone = normalizePhone(guestPhone)
      body.guest_name = guestName.trim()
    }

    try {
      const res = await fetch(`/api/campaigns/${id}/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await res.json()
      if (!res.ok) {
        setOrderError(d.error || 'Ошибка при оформлении')
      } else {
        setSubmitted(true)
        setCart({})
        // Обновляем баннер существующего заказа
        if (user) {
          fetch(`/api/campaigns/${id}/order?client_id=${user.id}`)
            .then(r => r.json())
            .then(d2 => { if (d2.order) setExistingOrder(d2.order) })
            .catch(() => {})
        }
      }
    } catch {
      setOrderError('Сетевая ошибка, попробуйте ещё раз')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-400 text-sm animate-pulse">Загрузка...</div>
      </div>
    )
  }

  if (fetchError || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-red-600 font-medium">{fetchError ?? 'Кампания не найдена'}</p>
        </div>
      </div>
    )
  }

  const { campaign, items } = data
  const isClosed = ['closed', 'delivered', 'cancelled'].includes(campaign.status)

  if (isClosed) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center px-4">
          <div className="text-6xl mb-4">🌸</div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">{campaign.title}</h1>
          <p className="text-gray-500">Кампания завершена</p>
        </div>
      </div>
    )
  }

  const deliveryFormatted = new Date(campaign.delivery_date).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const CartPanel = () => (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3" style={{ backgroundColor: '#7a1c2e' }}>
        <h3 className="font-semibold text-white">Предзаказ</h3>
        {cartCount > 0 && (
          <p className="text-xs text-white/70 mt-0.5">{cartCount} шт на сумму {cartTotal.toLocaleString('ru-RU')} ₸</p>
        )}
      </div>

      <div className="p-4">
        {cartItems.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">Добавьте товары из каталога</p>
        ) : (
          <>
            <div className="space-y-3 mb-4 max-h-72 overflow-y-auto">
              {cartItems.map(item => (
                <div key={item.id} className="flex items-start justify-between gap-2 text-sm">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-700 leading-tight line-clamp-2">
                      {item.product?.variety_name || item.product?.name}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">{cart[item.id]} шт</div>
                  </div>
                  <div className="font-semibold shrink-0" style={{ color: '#7a1c2e' }}>
                    {(item.price * (cart[item.id] ?? 0)).toLocaleString('ru-RU')} ₸
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t pt-3 mb-4 flex justify-between font-bold text-sm">
              <span>Итого</span>
              <span style={{ color: '#7a1c2e' }}>{cartTotal.toLocaleString('ru-RU')} ₸</span>
            </div>

            {showGuestForm && !isAuthed && (
              <div className="space-y-2 mb-3">
                <input
                  type="text"
                  placeholder="Ваше имя"
                  value={guestName}
                  onChange={e => setGuestName(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                  style={{ outlineColor: '#7a1c2e' }}
                />
                <input
                  type="tel"
                  placeholder="+7 XXX XXX XXXX"
                  value={guestPhone}
                  onChange={e => setGuestPhone(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                  style={{ outlineColor: '#7a1c2e' }}
                />
              </div>
            )}

            {orderError && (
              <p className="text-red-600 text-xs mb-3">{orderError}</p>
            )}

            {submitted ? (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                <div className="text-green-700 font-bold text-sm mb-1">Предзаказ оформлен!</div>
                <div className="text-green-600 text-xs">Ожидайте подтверждения от менеджера</div>
              </div>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={submitting || countdown.expired}
                className="w-full text-white font-semibold py-2.5 rounded-xl transition-colors text-sm disabled:opacity-50"
                style={{ backgroundColor: '#7a1c2e' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#9a2a40')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#7a1c2e')}
              >
                {submitting ? 'Оформляем...' : countdown.expired ? 'Приём заказов закрыт' : !isAuthed && !showGuestForm ? 'Далее → контакты' : 'Оформить предзаказ'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 pb-24 lg:pb-0">
      {/* Hero */}
      <div style={{ backgroundColor: '#7a1c2e' }}>
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="flex flex-wrap gap-2 mb-3">
            <span className="bg-white/20 text-white text-xs font-medium px-3 py-1 rounded-full">
              {TYPE_LABELS[campaign.type] ?? campaign.type}
            </span>
            <span className="bg-white/20 text-white text-xs font-medium px-3 py-1 rounded-full">
              Поставка {deliveryFormatted}
            </span>
            {campaign.status === 'draft' && (
              <span className="bg-yellow-400/30 text-yellow-100 text-xs font-medium px-3 py-1 rounded-full">
                Черновик
              </span>
            )}
          </div>

          <h1 className="text-2xl md:text-3xl font-bold text-white mb-3">{campaign.title}</h1>

          {campaign.description && (
            <p className="text-white/80 text-sm max-w-2xl mb-5">{campaign.description}</p>
          )}

          {/* Countdown */}
          {!countdown.expired ? (
            <div className="bg-white/10 rounded-xl p-4 inline-flex items-center gap-4">
              <span className="text-white/70 text-xs uppercase tracking-wide hidden sm:block">До закрытия</span>
              {[
                { value: countdown.days, label: 'дней' },
                { value: countdown.hours, label: 'часов' },
                { value: countdown.minutes, label: 'минут' },
              ].map((unit, i) => (
                <div key={unit.label} className="flex items-center gap-4">
                  {i > 0 && <span className="text-white/40 text-2xl font-light">:</span>}
                  <div className="text-center min-w-[2.5rem]">
                    <div className="text-3xl font-bold text-white leading-none">{unit.value}</div>
                    <div className="text-[10px] text-white/60 mt-1">{unit.label}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white/10 rounded-xl px-4 py-3 inline-block">
              <span className="text-yellow-200 text-sm font-medium">Приём заказов завершён</span>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-6 flex gap-6 items-start">
        {/* Catalog */}
        <div className="flex-1 min-w-0">
          {/* Баннер существующего предзаказа */}
          {existingOrder && (
            <div className="mb-4 border border-green-200 bg-green-50 rounded-xl px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className="font-semibold text-green-800 text-sm">✓ Ваш предзаказ оформлен</div>
                <div className="text-green-700 text-xs mt-0.5">
                  {existingOrder.items_count} {existingOrder.items_count === 1 ? 'позиция' : 'позиции'} на сумму{' '}
                  {existingOrder.total.toLocaleString('ru-RU')} ₸
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={loadOrderIntoCart}
                  className="text-xs px-3 py-1.5 rounded-lg font-medium border transition-colors"
                  style={{ borderColor: '#7a1c2e', color: '#7a1c2e' }}
                >
                  Изменить
                </button>
                <button
                  onClick={cancelExistingOrder}
                  disabled={cancellingOrder}
                  className="text-xs px-3 py-1.5 rounded-lg font-medium bg-red-100 text-red-700 hover:bg-red-200 transition-colors disabled:opacity-50"
                >
                  {cancellingOrder ? '...' : 'Отменить'}
                </button>
              </div>
            </div>
          )}

          <div id="campaign-catalog" className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-700">
              Товары <span className="text-gray-400 font-normal">({items.length})</span>
            </h2>
          </div>

          {items.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
              Товары ещё не добавлены
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
              {items.map(item => {
                const qty = cart[item.id] ?? 0
                const p = item.product
                const displayName = p?.variety_name || p?.name || '—'
                const colors = p?.colors ?? []

                return (
                  <div
                    key={item.id}
                    className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col hover:shadow-md transition-shadow"
                  >
                    {/* Image */}
                    <div className="aspect-square bg-pink-50 relative overflow-hidden">
                      {p?.image_url ? (
                        <img src={p.image_url} alt={displayName} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-5xl select-none">🌸</div>
                      )}
                      {item.min_qty > item.pack_size && (
                        <span
                          className="absolute top-2 left-2 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                          style={{ backgroundColor: '#7a1c2e' }}
                        >
                          мин {item.min_qty}
                        </span>
                      )}
                    </div>

                    {/* Info */}
                    <div className="p-3 flex flex-col gap-1 flex-1">
                      <div className="font-semibold text-sm leading-tight text-gray-800 line-clamp-2">
                        {displayName}
                      </div>

                      {colors.length > 0 && (
                        <div className="flex gap-1 flex-wrap mt-0.5">
                          {colors.map(c => {
                            const col = COLORS.find(x => x.key === c)
                            if (!col) return null
                            return (
                              <div
                                key={c}
                                title={col.label}
                                style={{
                                  width: 10,
                                  height: 10,
                                  borderRadius: '50%',
                                  background: ('gradient' in col ? col.gradient : col.bg) as string,
                                  border: '1px solid rgba(0,0,0,0.12)',
                                  flexShrink: 0,
                                }}
                              />
                            )
                          })}
                        </div>
                      )}

                      {p?.length_str && (
                        <span className="text-[11px] text-gray-400">{p.length_str}</span>
                      )}

                      {item.notes && (
                        <span className="text-[11px] italic" style={{ color: '#7a1c2e' }}>{item.notes}</span>
                      )}

                      {/* Price */}
                      <div className="mt-auto pt-1">
                        <span className="text-base font-bold" style={{ color: '#7a1c2e' }}>
                          {item.price.toLocaleString('ru-RU')} ₸
                        </span>
                      </div>

                      {/* Controls */}
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[10px] text-gray-400">уп.&nbsp;{item.pack_size}</span>
                        <div className="flex items-center gap-1">
                          <button
                            className="w-7 h-7 border rounded-lg text-sm font-bold hover:bg-gray-100 disabled:opacity-30 transition-colors"
                            onClick={() => decrement(item)}
                            disabled={qty === 0}
                          >
                            −
                          </button>
                          <span className="w-7 text-center text-sm font-semibold">{qty}</span>
                          <button
                            className="w-7 h-7 text-white rounded-lg text-sm font-bold transition-colors disabled:opacity-30"
                            style={{ backgroundColor: '#7a1c2e' }}
                            onClick={() => increment(item)}
                            disabled={countdown.expired}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Sticky desktop cart */}
        <div className="w-72 shrink-0 hidden lg:block">
          <div className="sticky top-4">
            <CartPanel />
          </div>
        </div>
      </div>

      {/* Mobile bottom bar */}
      {cartCount > 0 && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-2xl px-4 py-3 z-50">
          {showGuestForm && !isAuthed && (
            <div className="space-y-2 mb-3">
              <input
                type="text"
                placeholder="Ваше имя"
                value={guestName}
                onChange={e => setGuestName(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none"
              />
              <input
                type="tel"
                placeholder="+7 XXX XXX XXXX"
                value={guestPhone}
                onChange={e => setGuestPhone(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none"
              />
            </div>
          )}
          {orderError && <p className="text-red-600 text-xs mb-2">{orderError}</p>}
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="text-xs text-gray-500">{cartCount} шт</div>
              <div className="font-bold text-sm" style={{ color: '#7a1c2e' }}>
                {cartTotal.toLocaleString('ru-RU')} ₸
              </div>
            </div>
            {submitted ? (
              <div className="text-green-700 font-semibold text-sm">Оформлено ✓</div>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={submitting || countdown.expired}
                className="text-white font-semibold px-5 py-2.5 rounded-xl transition-colors text-sm disabled:opacity-50"
                style={{ backgroundColor: '#7a1c2e' }}
              >
                {submitting ? 'Оформляем...' : !isAuthed && !showGuestForm ? 'Далее' : 'Оформить'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

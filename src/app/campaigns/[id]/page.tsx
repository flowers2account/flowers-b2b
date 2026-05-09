'use client'

import { useEffect, useState, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { useAuthStore } from '@/lib/auth-store'
import { normalizePhone } from '@/lib/phone'
import { COLORS } from '@/lib/colors'
import { useIsMobile } from '@/lib/use-mobile'
import type { Campaign, CampaignStats } from '@/types/campaigns'

// ── Types ──────────────────────────────────────────────────────────────────────

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

type ExistingOrder = {
  id: number
  status: string
  total: number
  items_count: number
  items: { campaign_item_id: number; qty: number; price: number }[]
} | null

type CartState = Record<number, number>

const TYPE_LABELS: Record<string, string> = { europe: 'Европа', china: 'Китай' }
const HEADER_H = 104

// ── Hooks ──────────────────────────────────────────────────────────────────────

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

// ── Filter sidebar ─────────────────────────────────────────────────────────────

type FilterProps = {
  items: CampaignItemFull[]
  filterSearch: string
  filterColors: string[]
  filterRoles: string[]
  onSearch: (v: string) => void
  onColorToggle: (v: string) => void
  onRoleToggle: (v: string) => void
  onReset: () => void
  hasFilters: boolean
}

const ROLE_LABELS: Record<string, string> = {
  main: 'Основные',
  accent: 'Акцентные',
  filler: 'Наполнители',
  green: 'Зелень',
}

function FilterSidebar({ items, filterSearch, filterColors, filterRoles, onSearch, onColorToggle, onRoleToggle, onReset, hasFilters }: FilterProps) {
  const allColors = useMemo(() => {
    const s = new Set<string>()
    items.forEach(i => i.product?.colors?.forEach(c => s.add(c)))
    return Array.from(s)
  }, [items])

  const allRoles = useMemo(() => {
    const s = new Set<string>()
    items.forEach(i => { if (i.product?.floral_role) s.add(i.product.floral_role) })
    return Array.from(s)
  }, [items])

  return (
    <div className="p-4 space-y-5">
      <input
        type="search"
        placeholder="Поиск..."
        value={filterSearch}
        onChange={e => onSearch(e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
        style={{ outlineColor: '#7a1c2e' }}
      />

      {allColors.length > 0 && (
        <div>
          <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Цвет</div>
          <div className="flex flex-wrap gap-1.5">
            {allColors.map(c => {
              const col = COLORS.find(x => x.key === c)
              if (!col) return null
              const active = filterColors.includes(c)
              return (
                <button
                  key={c}
                  title={col.label}
                  onClick={() => onColorToggle(c)}
                  className="flex items-center gap-1 text-xs px-2 py-1 rounded-full border transition-all"
                  style={{
                    borderColor: active ? '#7a1c2e' : '#e5e7eb',
                    background: active ? '#f5f0f3' : '#fff',
                    color: active ? '#7a1c2e' : '#666',
                    fontWeight: active ? 600 : 400,
                  }}
                >
                  <span
                    style={{
                      width: 9, height: 9, borderRadius: '50%', flexShrink: 0,
                      background: ('gradient' in col ? col.gradient : col.bg) as string,
                      border: '1px solid rgba(0,0,0,0.12)',
                    }}
                  />
                  {col.label}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {allRoles.length > 0 && (
        <div>
          <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Роль</div>
          <div className="space-y-0.5">
            {allRoles.map(role => {
              const active = filterRoles.includes(role)
              return (
                <button
                  key={role}
                  onClick={() => onRoleToggle(role)}
                  className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors"
                  style={{ background: active ? '#f5f0f3' : 'transparent', color: active ? '#7a1c2e' : '#555', fontWeight: active ? 600 : 400 }}
                >
                  <span
                    className="w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center"
                    style={{ borderColor: active ? '#7a1c2e' : '#ccc', background: active ? '#7a1c2e' : '#fff', color: '#fff', fontSize: 9 }}
                  >{active ? '✓' : ''}</span>
                  {ROLE_LABELS[role] ?? role}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {hasFilters && (
        <button onClick={onReset} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
          Сбросить фильтры
        </button>
      )}
    </div>
  )
}

// ── Cart + existing order panel ────────────────────────────────────────────────

type CartContentProps = {
  cartItems: CampaignItemFull[]
  cart: CartState
  cartTotal: number
  cartCount: number
  submitted: boolean
  submitting: boolean
  countdown: { expired: boolean }
  showGuestForm: boolean
  guestName: string
  guestPhone: string
  orderError: string | null
  isAuthed: boolean
  setGuestName: (v: string) => void
  setGuestPhone: (v: string) => void
  onSubmit: () => void
  existingOrder: ExistingOrder
  onLoadOrder: () => void
  onCancelOrder: () => void
  cancellingOrder: boolean
}

function CartContent({
  cartItems, cart, cartTotal, cartCount, submitted, submitting, countdown,
  showGuestForm, guestName, guestPhone, orderError, isAuthed,
  setGuestName, setGuestPhone, onSubmit,
  existingOrder, onLoadOrder, onCancelOrder, cancellingOrder,
}: CartContentProps) {
  return (
    <div className="flex flex-col">
      {/* Existing order banner */}
      {existingOrder && cartCount === 0 && (
        <div className="mx-3 mt-3 border border-green-200 bg-green-50 rounded-xl px-3 py-2.5">
          <div className="font-semibold text-green-800 text-sm">✓ Предзаказ оформлен</div>
          <div className="text-green-700 text-xs mt-0.5">
            {existingOrder.items_count} поз. · {existingOrder.total.toLocaleString('ru-RU')} ₸
          </div>
          <div className="flex gap-2 mt-2">
            <button
              onClick={onLoadOrder}
              className="text-xs px-2.5 py-1 rounded-lg font-medium border transition-colors"
              style={{ borderColor: '#7a1c2e', color: '#7a1c2e' }}
            >Изменить</button>
            <button
              onClick={onCancelOrder}
              disabled={cancellingOrder}
              className="text-xs px-2.5 py-1 rounded-lg font-medium bg-red-50 text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50"
            >{cancellingOrder ? '...' : 'Отменить'}</button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="px-4 py-3 mt-3" style={{ backgroundColor: '#7a1c2e' }}>
        <h3 className="font-semibold text-white text-sm">Предзаказ</h3>
        {cartCount > 0 && (
          <p className="text-xs text-white/70 mt-0.5">{cartCount} шт · {cartTotal.toLocaleString('ru-RU')} ₸</p>
        )}
      </div>

      <div className="p-4 flex flex-col gap-3">
        {cartItems.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">Добавьте товары из каталога</p>
        ) : (
          <>
            <div className="space-y-3 max-h-64 overflow-y-auto">
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

            <div className="border-t pt-3 flex justify-between font-bold text-sm">
              <span>Итого</span>
              <span style={{ color: '#7a1c2e' }}>{cartTotal.toLocaleString('ru-RU')} ₸</span>
            </div>

            {showGuestForm && !isAuthed && (
              <div className="space-y-2">
                <input type="text" placeholder="Ваше имя" value={guestName}
                  onChange={e => setGuestName(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none"
                  style={{ outlineColor: '#7a1c2e' }} />
                <input type="tel" placeholder="+7 XXX XXX XXXX" value={guestPhone}
                  onChange={e => setGuestPhone(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none"
                  style={{ outlineColor: '#7a1c2e' }} />
              </div>
            )}

            {orderError && <p className="text-red-600 text-xs">{orderError}</p>}

            {submitted ? (
              <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
                <div className="text-green-700 font-bold text-sm">Предзаказ оформлен!</div>
                <div className="text-green-600 text-xs mt-0.5">Ожидайте подтверждения</div>
              </div>
            ) : (
              <button
                onClick={onSubmit}
                disabled={submitting || countdown.expired}
                className="w-full text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50 transition-colors"
                style={{ backgroundColor: '#7a1c2e' }}
              >
                {submitting ? 'Оформляем...'
                  : countdown.expired ? 'Приём заказов закрыт'
                  : !isAuthed && !showGuestForm ? 'Далее → контакты'
                  : 'Оформить предзаказ'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function CampaignDetailPage() {
  const { id } = useParams()
  const { user, isAuthed, init } = useAuthStore()
  const isMobile = useIsMobile()

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

  const [filterSearch, setFilterSearch] = useState('')
  const [filterColors, setFilterColors] = useState<string[]>([])
  const [filterRoles, setFilterRoles] = useState<string[]>([])

  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isCartOpen, setIsCartOpen] = useState(false)

  useEffect(() => {
    init()
    fetch(`/api/campaigns/${id}`)
      .then(r => r.json())
      .then(d => { if (d.error) setFetchError(d.error); else setData(d) })
      .catch(() => setFetchError('Не удалось загрузить кампанию'))
      .finally(() => setLoading(false))
  }, [id, init])

  useEffect(() => {
    if (!user || !id) return
    fetch(`/api/campaigns/${id}/order?client_id=${user.id}`)
      .then(r => r.json())
      .then(d => { if (d.order) setExistingOrder(d.order) })
      .catch(() => {})
  }, [user?.id, id])

  const countdown = useCountdown(data?.campaign?.closes_at)

  const increment = (item: CampaignItemFull) => {
    setCart(prev => {
      const cur = prev[item.id] ?? 0
      return { ...prev, [item.id]: cur === 0 ? item.min_qty : cur + item.pack_size }
    })
  }

  const decrement = (item: CampaignItemFull) => {
    setCart(prev => ({ ...prev, [item.id]: Math.max(0, (prev[item.id] ?? 0) - item.pack_size) }))
  }

  const loadOrderIntoCart = () => {
    if (!existingOrder) return
    const newCart: CartState = {}
    existingOrder.items.forEach(i => { newCart[i.campaign_item_id] = i.qty })
    setCart(newCart)
    setSubmitted(false)
    setExistingOrder(null)
    setIsCartOpen(false)
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

  const handleSubmit = async () => {
    if (!isAuthed && !showGuestForm) { setShowGuestForm(true); return }
    if (!isAuthed && (!guestName.trim() || !guestPhone.trim())) {
      setOrderError('Введите имя и номер телефона')
      return
    }
    if (cartItems.length === 0) return

    setSubmitting(true)
    setOrderError(null)

    const body: Record<string, unknown> = {
      items: cartItems.map(item => ({ campaign_item_id: item.id, qty: cart[item.id], price: item.price })),
    }
    if (isAuthed && user) body.client_id = user.id
    else { body.guest_phone = normalizePhone(guestPhone); body.guest_name = guestName.trim() }

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

  const filteredItems = useMemo(() => {
    if (!data) return []
    return data.items.filter(item => {
      if (filterSearch) {
        const name = `${item.product?.variety_name ?? ''} ${item.product?.name ?? ''}`.toLowerCase()
        if (!name.includes(filterSearch.toLowerCase())) return false
      }
      if (filterColors.length > 0 && !item.product?.colors?.some(c => filterColors.includes(c))) return false
      if (filterRoles.length > 0 && (!item.product?.floral_role || !filterRoles.includes(item.product.floral_role))) return false
      return true
    })
  }, [data, filterSearch, filterColors, filterRoles])

  const cartItems = (data?.items ?? []).filter(item => (cart[item.id] ?? 0) > 0)
  const cartTotal = cartItems.reduce((sum, item) => sum + item.price * (cart[item.id] ?? 0), 0)
  const cartCount = cartItems.reduce((sum, item) => sum + (cart[item.id] ?? 0), 0)
  const hasFilters = !!(filterSearch || filterColors.length > 0 || filterRoles.length > 0)
  const activeFiltersCount = [filterSearch, filterColors.length > 0, filterRoles.length > 0].filter(Boolean).length

  const resetFilters = () => { setFilterSearch(''); setFilterColors([]); setFilterRoles([]) }

  const toggleColor = (v: string) => setFilterColors(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v])
  const toggleRole = (v: string) => setFilterRoles(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v])

  // ── Guard states ──────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-gray-400 text-sm animate-pulse">Загрузка...</div>
    </div>
  )

  if (fetchError || !data) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <p className="text-red-600 font-medium">{fetchError ?? 'Кампания не найдена'}</p>
    </div>
  )

  const { campaign, items } = data
  const isClosed = ['closed', 'delivered', 'cancelled'].includes(campaign.status)

  if (isClosed) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center px-4">
        <div className="text-6xl mb-4">🌸</div>
        <h1 className="text-2xl font-bold text-gray-800 mb-2">{campaign.title}</h1>
        <p className="text-gray-500">Кампания завершена</p>
      </div>
    </div>
  )

  const deliveryFormatted = new Date(campaign.delivery_date).toLocaleDateString('ru-RU', {
    day: 'numeric', month: 'long', year: 'numeric',
  })

  const filterProps: FilterProps = {
    items, filterSearch, filterColors, filterRoles, hasFilters,
    onSearch: setFilterSearch, onColorToggle: toggleColor, onRoleToggle: toggleRole, onReset: resetFilters,
  }

  const cartProps: CartContentProps = {
    cartItems, cart, cartTotal, cartCount,
    submitted, submitting, countdown,
    showGuestForm, guestName, guestPhone, orderError, isAuthed,
    setGuestName, setGuestPhone, onSubmit: handleSubmit,
    existingOrder, onLoadOrder: loadOrderIntoCart, onCancelOrder: cancelExistingOrder, cancellingOrder,
  }

  // Shared items grid JSX (variable, not component — avoids remount)
  const itemsGrid = (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-500">
          Товары{' '}
          <span className="font-normal text-gray-400">
            ({filteredItems.length}{filteredItems.length !== items.length ? ` из ${items.length}` : ''})
          </span>
        </h2>
      </div>

      {filteredItems.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
          {items.length === 0 ? 'Товары ещё не добавлены' : 'Ничего не найдено'}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredItems.map(item => {
            const qty = cart[item.id] ?? 0
            const p = item.product
            const displayName = p?.variety_name || p?.name || '—'
            const colors = p?.colors ?? []

            return (
              <div
                key={item.id}
                className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col hover:shadow-md transition-shadow"
              >
                <div className="aspect-square bg-pink-50 relative overflow-hidden">
                  {p?.image_url
                    ? <img src={p.image_url} alt={displayName} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-5xl select-none">🌸</div>
                  }
                  {item.min_qty > item.pack_size && (
                    <span className="absolute top-2 left-2 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md" style={{ backgroundColor: '#7a1c2e' }}>
                      мин {item.min_qty}
                    </span>
                  )}
                </div>

                <div className="p-3 flex flex-col gap-1 flex-1">
                  <div className="font-semibold text-sm leading-tight text-gray-800 line-clamp-2">{displayName}</div>

                  {colors.length > 0 && (
                    <div className="flex gap-1 flex-wrap mt-0.5">
                      {colors.map(c => {
                        const col = COLORS.find(x => x.key === c)
                        if (!col) return null
                        return (
                          <div key={c} title={col.label} style={{
                            width: 10, height: 10, borderRadius: '50%',
                            background: ('gradient' in col ? col.gradient : col.bg) as string,
                            border: '1px solid rgba(0,0,0,0.12)', flexShrink: 0,
                          }} />
                        )
                      })}
                    </div>
                  )}

                  {p?.length_str && <span className="text-[11px] text-gray-400">{p.length_str}</span>}
                  {item.notes && <span className="text-[11px] italic" style={{ color: '#7a1c2e' }}>{item.notes}</span>}

                  <div className="mt-auto pt-1">
                    <span className="text-base font-bold" style={{ color: '#7a1c2e' }}>
                      {item.price.toLocaleString('ru-RU')} ₸
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[10px] text-gray-400">уп.&nbsp;{item.pack_size}</span>
                    <div className="flex items-center gap-1">
                      <button
                        className="w-7 h-7 border rounded-lg text-sm font-bold hover:bg-gray-100 disabled:opacity-30 transition-colors"
                        onClick={() => decrement(item)}
                        disabled={qty === 0}
                      >−</button>
                      <span className="w-7 text-center text-sm font-semibold">{qty}</span>
                      <button
                        className="w-7 h-7 text-white rounded-lg text-sm font-bold disabled:opacity-30 transition-colors"
                        style={{ backgroundColor: '#7a1c2e' }}
                        onClick={() => increment(item)}
                        disabled={countdown.expired}
                      >+</button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )

  // ── Render ─────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Hero ──────────────────────────────────────────────────────────────── */}
      <div style={{ backgroundColor: '#7a1c2e' }}>
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex flex-wrap gap-2 mb-2">
            <span className="bg-white/20 text-white text-xs font-medium px-3 py-1 rounded-full">
              {TYPE_LABELS[campaign.type] ?? campaign.type}
            </span>
            <span className="bg-white/20 text-white text-xs font-medium px-3 py-1 rounded-full">
              Поставка {deliveryFormatted}
            </span>
            {campaign.status === 'draft' && (
              <span className="bg-yellow-400/30 text-yellow-100 text-xs font-medium px-3 py-1 rounded-full">Черновик</span>
            )}
          </div>

          <h1 className="text-xl md:text-2xl font-bold text-white mb-2">{campaign.title}</h1>

          {campaign.description && (
            <p className="text-white/75 text-sm max-w-xl mb-4">{campaign.description}</p>
          )}

          {!countdown.expired ? (
            <div className="bg-white/10 rounded-xl p-3 inline-flex items-center gap-4">
              <span className="text-white/60 text-xs uppercase tracking-wide hidden sm:block">До закрытия</span>
              {[
                { value: countdown.days, label: 'дней' },
                { value: countdown.hours, label: 'часов' },
                { value: countdown.minutes, label: 'минут' },
              ].map((unit, i) => (
                <div key={unit.label} className="flex items-center gap-4">
                  {i > 0 && <span className="text-white/40 text-xl font-light">:</span>}
                  <div className="text-center min-w-[2rem]">
                    <div className="text-2xl font-bold text-white leading-none">{unit.value}</div>
                    <div className="text-[10px] text-white/60 mt-0.5">{unit.label}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white/10 rounded-xl px-4 py-2 inline-block">
              <span className="text-yellow-200 text-sm font-medium">Приём заказов завершён</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Desktop: три колонки ──────────────────────────────────────────────── */}
      <div
        id="campaign-catalog"
        className="hidden lg:grid"
        style={{ gridTemplateColumns: '200px 1fr 280px' }}
      >
        {/* Левая — фильтры */}
        <aside
          className="bg-white overflow-y-auto"
          style={{
            borderRight: '1px solid #e8e8e8',
            position: 'sticky', top: HEADER_H,
            height: `calc(100vh - ${HEADER_H}px)`,
            alignSelf: 'start',
          }}
        >
          <FilterSidebar {...filterProps} />
        </aside>

        {/* Центр — товары */}
        <main
          className="bg-[#fafafa] px-4 py-4"
          style={{ minHeight: `calc(100vh - ${HEADER_H}px)` }}
        >
          {itemsGrid}
        </main>

        {/* Правая — баннер + корзина */}
        <aside
          className="bg-white overflow-y-auto"
          style={{
            borderLeft: '1px solid #e8e8e8',
            position: 'sticky', top: HEADER_H,
            height: `calc(100vh - ${HEADER_H}px)`,
            alignSelf: 'start',
          }}
        >
          <CartContent {...cartProps} />
        </aside>
      </div>

      {/* ── Mobile: товары ────────────────────────────────────────────────────── */}
      <div className="lg:hidden px-4 py-4 pb-32">
        {itemsGrid}
      </div>

      {/* ── Mobile: баннер предзаказа над баром ──────────────────────────────── */}
      {existingOrder && cartCount === 0 && (
        <div
          className="lg:hidden fixed left-3 right-3 z-30 border border-green-200 bg-green-50 rounded-xl px-3 py-2 flex items-center justify-between gap-3 shadow"
          style={{ bottom: 72 }}
        >
          <div>
            <div className="font-semibold text-green-800 text-xs">✓ Предзаказ оформлен</div>
            <div className="text-green-700 text-[11px]">{existingOrder.items_count} поз. · {existingOrder.total.toLocaleString('ru-RU')} ₸</div>
          </div>
          <div className="flex gap-2 shrink-0">
            <button onClick={loadOrderIntoCart} className="text-[11px] px-2 py-1 rounded border font-medium" style={{ borderColor: '#7a1c2e', color: '#7a1c2e' }}>
              Изменить
            </button>
            <button onClick={cancelExistingOrder} disabled={cancellingOrder} className="text-[11px] px-2 py-1 rounded bg-red-50 text-red-600 font-medium disabled:opacity-50">
              Отменить
            </button>
          </div>
        </div>
      )}

      {/* ── Mobile: нижний бар ────────────────────────────────────────────────── */}
      <div
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white"
        style={{ borderTop: '0.5px solid #e8e8e8', padding: '8px 12px' }}
      >
        <div className="flex gap-2">
          <button
            onClick={() => setIsFilterOpen(true)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium"
            style={{ background: '#f5f0f3', color: '#7a1c2e', border: '0.5px solid #c97a92' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/>
            </svg>
            Фильтры{activeFiltersCount > 0 ? ` (${activeFiltersCount})` : ''}
          </button>
          {cartCount > 0 && (
            <button
              onClick={() => setIsCartOpen(true)}
              className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white"
              style={{ backgroundColor: '#7a1c2e' }}
            >
              Корзина ({cartCount}) · {cartTotal.toLocaleString('ru-RU')} ₸
            </button>
          )}
        </div>
      </div>

      {/* ── Mobile: sheet фильтров ────────────────────────────────────────────── */}
      {isFilterOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/40" style={{ zIndex: 49 }} onClick={() => setIsFilterOpen(false)} />
      )}
      <div
        className="lg:hidden fixed bottom-0 left-0 right-0 bg-white flex flex-col"
        style={{
          height: '85vh', borderRadius: '16px 16px 0 0',
          transform: isFilterOpen ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.3s ease', zIndex: 50,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 4px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: '#ddd' }} />
        </div>
        <div className="flex items-center justify-between px-4 py-2 border-b">
          <button onClick={() => setIsFilterOpen(false)} className="text-sm font-medium" style={{ color: '#7a1c2e' }}>← Закрыть</button>
          <span className="text-sm font-semibold">Фильтры</span>
          <div style={{ width: 56 }} />
        </div>
        <div className="flex-1 overflow-y-auto">
          <FilterSidebar {...filterProps} />
        </div>
        <div className="p-3 border-t">
          <button
            onClick={() => setIsFilterOpen(false)}
            className="w-full py-3 text-white font-semibold rounded-xl text-sm"
            style={{ backgroundColor: '#7a1c2e' }}
          >
            Показать {filteredItems.length} товаров
          </button>
        </div>
      </div>

      {/* ── Mobile: sheet корзины ─────────────────────────────────────────────── */}
      {isCartOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/40" style={{ zIndex: 49 }} onClick={() => setIsCartOpen(false)} />
      )}
      <div
        className="lg:hidden fixed bottom-0 left-0 right-0 bg-white flex flex-col"
        style={{
          height: '85vh', borderRadius: '16px 16px 0 0',
          transform: isCartOpen ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.3s ease', zIndex: 50,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 4px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: '#ddd' }} />
        </div>
        <button onClick={() => setIsCartOpen(false)} className="text-sm font-medium px-4 py-2 border-b text-left w-full" style={{ color: '#7a1c2e' }}>
          ← Закрыть
        </button>
        <div className="flex-1 overflow-y-auto">
          <CartContent {...cartProps} />
        </div>
      </div>
    </div>
  )
}

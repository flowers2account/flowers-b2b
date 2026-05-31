'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { checkoutPreorder } from '@/app/admin/preorder-actions'
import { useIsMobile } from '@/lib/use-mobile'

// ── Types ──────────────────────────────────────────────────────────────────

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

type Phase = 'checking' | 'join' | 'pending' | 'room' | 'ordered'
type RightPanel = 'empty' | 'detail' | 'cart'

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('ru-RU', {
    timeZone: 'Asia/Oral', day: 'numeric', month: 'short',
  })
}

const STOCK_LABELS: Record<string, string> = {
  STOCK: 'Наличие', VMP: 'VMP', PROMOTION: 'Акция',
}

// ── InfoRow primitive (shared by detail panel) ─────────────────────────────

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 6,
      padding: '4px 0', borderBottom: '1px solid var(--border)',
    }}>
      <span style={{ fontSize: 11, color: 'var(--text-mid)', minWidth: 80, flexShrink: 0, paddingTop: 1 }}>
        {label}
      </span>
      <span style={{ fontSize: 11, color: 'var(--text)', fontWeight: 500 }}>{children}</span>
    </div>
  )
}

// ── Left panel: Filters ────────────────────────────────────────────────────

function PreorderFilters({
  items, selectedTypes, setSelectedTypes,
  priceSort, setPriceSort,
}: {
  selectedTypes: string[]; setSelectedTypes: (t: string[]) => void
  priceSort: '' | 'asc' | 'desc'; setPriceSort: (s: '' | 'asc' | 'desc') => void
  items: RoomItem[]
  selectedDates: string[]; setSelectedDates: (d: string[]) => void
}) {
  const types = Array.from(
    new Set(items.map(i => i.oz_stock_type).filter(Boolean) as string[])
  )
  const activeCount = selectedTypes.length + (priceSort !== '' ? 1 : 0)

  function toggleType(t: string) {
    setSelectedTypes(selectedTypes.includes(t)
      ? selectedTypes.filter(x => x !== t)
      : [...selectedTypes, t])
  }

  return (
    <div style={{ padding: '12px 0' }}>
      {activeCount > 0 && (
        <div style={{ padding: '0 12px 10px' }}>
          <button
            onClick={() => { setSelectedTypes([]); setPriceSort('') }}
            style={{
              fontSize: 11, color: 'var(--accent)', background: 'var(--accent-light)',
              border: '1px solid var(--accent)', borderRadius: 12, padding: '2px 10px',
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Сбросить ({activeCount})
          </button>
        </div>
      )}

      {types.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{
            padding: '0 12px 6px', fontSize: 11, fontWeight: 600,
            color: 'var(--text-mid)', textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>
            Тип склада
          </div>
          {types.map(t => (
            <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={selectedTypes.includes(t)}
                onChange={() => toggleType(t)}
                style={{ accentColor: 'var(--accent)', width: 14, height: 14 }}
              />
              <span style={{ fontSize: 12, color: 'var(--text)' }}>
                {STOCK_LABELS[t] ?? t}
              </span>
            </label>
          ))}
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <div style={{
          padding: '0 12px 6px', fontSize: 11, fontWeight: 600,
          color: 'var(--text-mid)', textTransform: 'uppercase', letterSpacing: '0.05em',
        }}>
          Цена за стебель
        </div>
        {(['', 'asc', 'desc'] as const).map(v => (
          <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px', cursor: 'pointer' }}>
            <input
              type="radio"
              name="priceSort"
              checked={priceSort === v}
              onChange={() => setPriceSort(v)}
              style={{ accentColor: 'var(--accent)', width: 14, height: 14 }}
            />
            <span style={{ fontSize: 12, color: 'var(--text)' }}>
              {v === '' ? 'По умолчанию' : v === 'asc' ? 'Сначала дешевле' : 'Сначала дороже'}
            </span>
          </label>
        ))}
      </div>
    </div>
  )
}

// ── Card stepper (center grid) ─────────────────────────────────────────────

function PreorderCard({
  item, qty, onSetQty, onClick, isSelected, onCartOpen,
}: {
  item: RoomItem
  qty: number
  onSetQty: (n: number) => void
  onClick: () => void
  isSelected: boolean
  onCartOpen: () => void
}) {
  const inCart = qty > 0
  const max = item.oz_available_stems
  const canInc = max === null || qty + item.pack_size <= max
  const min = item.min_qty ?? item.pack_size

  return (
    <div
      onClick={onClick}
      style={{
        border: `1.5px solid ${isSelected ? 'var(--accent)' : inCart ? 'var(--accent-mid)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-card)',
        overflow: 'hidden',
        background: '#fff',
        cursor: 'pointer',
        boxShadow: isSelected
          ? '0 0 0 2px var(--accent-light)'
          : inCart ? '0 2px 8px rgba(139,58,90,0.08)' : 'none',
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}
    >
      <div style={{ position: 'relative', aspectRatio: '1', background: 'var(--bg2)', overflow: 'hidden' }}>
        {item.image_url ? (
          <Image
            src={item.image_url}
            alt={item.display_name ?? item.name}
            fill
            sizes="(max-width: 768px) 50vw, 200px"
            style={{ objectFit: 'cover' }}
          />
        ) : (
          <div style={{
            width: '100%', height: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 40, opacity: 0.18,
          }}>🌸</div>
        )}
        {inCart && (
          <div style={{
            position: 'absolute', top: 6, right: 6,
            background: 'var(--accent)', color: '#fff',
            borderRadius: '50%', width: 20, height: 20,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 700,
          }}>✓</div>
        )}
      </div>

      <div style={{ padding: '8px 10px 10px' }}>
        <div style={{
          fontSize: 12, fontWeight: 600, lineHeight: 1.35, marginBottom: 4,
          overflow: 'hidden', display: '-webkit-box',
          WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        }}>
          {item.display_name ?? item.name}
        </div>

        {item.oz_stock_type && (
          <div style={{ marginBottom: 6 }}>
            <span style={{
              fontSize: 10, color: 'var(--text-mid)',
              background: 'var(--bg2)', borderRadius: 4, padding: '1px 6px',
            }}>
              {STOCK_LABELS[item.oz_stock_type] ?? item.oz_stock_type}
            </span>
          </div>
        )}

        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)', marginBottom: 2 }}>
          {item.price.toLocaleString('ru-RU')} ₸/стебель
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-mid)', marginBottom: 8 }}>
          кратность {item.pack_size}
          {max !== null && ` · доступно ${max}`}
        </div>

        <div
          onClick={e => e.stopPropagation()}
          style={{
            display: 'flex', alignItems: 'center',
            border: `1px solid ${inCart ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: 'var(--radius-btn)', overflow: 'hidden',
            transition: 'border-color 0.15s',
          }}
        >
          <button
            onClick={() => inCart && onSetQty(qty - item.pack_size)}
            style={{
              width: 32, height: 28, border: 'none',
              background: 'var(--bg2)', color: 'var(--accent)',
              fontSize: 15, fontWeight: 700,
              cursor: inCart ? 'pointer' : 'default',
              opacity: inCart ? 1 : 0.25,
            }}
          >−</button>
          <span style={{
            flex: 1, textAlign: 'center', fontSize: 11, fontWeight: 700,
            borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)',
            lineHeight: '28px', color: inCart ? 'var(--accent)' : 'var(--text-mid)',
          }}>
            {qty}
          </span>
          <button
            onClick={e => { e.stopPropagation(); onSetQty(qty === 0 ? min : qty + item.pack_size); onCartOpen() }}
            disabled={!canInc}
            style={{
              width: 32, height: 28, border: 'none',
              background: canInc ? 'var(--accent)' : '#f0f0f0',
              color: '#fff', fontSize: 15, fontWeight: 700,
              cursor: canInc ? 'pointer' : 'default',
              opacity: canInc ? 1 : 0.35,
            }}
          >+</button>
        </div>
      </div>
    </div>
  )
}

// ── Right panel: item detail ───────────────────────────────────────────────

function PreorderDetailView({
  item, qty, onSetQty, onGoToCart, onClose,
}: {
  item: RoomItem
  qty: number
  onSetQty: (n: number) => void
  onGoToCart: () => void
  onClose: () => void
}) {
  const inCart = qty > 0
  const max = item.oz_available_stems
  const canInc = max === null || qty + item.pack_size <= max
  const min = item.min_qty ?? item.pack_size

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
      <div style={{
        position: 'sticky', top: 0, background: '#fff', zIndex: 10,
        borderBottom: '1px solid var(--border)', padding: '8px 12px', flexShrink: 0,
      }}>
        <button
          onClick={onClose}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-mid)', fontSize: 12, fontFamily: 'inherit',
            padding: '4px 6px', borderRadius: 'var(--radius-btn)',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
          К витрине
        </button>
      </div>

      <div style={{ flexShrink: 0, padding: '12px 12px 0' }}>
        <div style={{ aspectRatio: '3/2', background: 'var(--bg2)', overflow: 'hidden', position: 'relative' }}>
          {item.image_url ? (
            <Image fill src={item.image_url} alt={item.display_name ?? item.name} sizes="280px" style={{ objectFit: 'contain' }} />
          ) : (
            <div style={{
              width: '100%', height: '100%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 64, opacity: 0.18,
            }}>🌸</div>
          )}
        </div>
      </div>

      <div style={{ padding: '12px 12px 16px', display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div style={{
          fontFamily: 'var(--font-playfair)', fontSize: 14, fontWeight: 400,
          lineHeight: 1.35, marginBottom: 10,
        }}>
          {item.display_name ?? item.name}
        </div>

        <div style={{ marginBottom: 12 }}>
          {item.oz_delivery_date && (
            <InfoRow label="Срезка">{fmtDate(item.oz_delivery_date)!}</InfoRow>
          )}
          {item.oz_stock_type && (
            <InfoRow label="Склад">{STOCK_LABELS[item.oz_stock_type] ?? item.oz_stock_type}</InfoRow>
          )}
          <InfoRow label="Кратность">{item.pack_size} стеблей</InfoRow>
          {max !== null && (
            <InfoRow label="Доступно">
              <span style={{
                color: max > 50 ? '#388E3C' : max > 10 ? '#F9A825' : '#E53935',
                fontWeight: 700,
              }}>
                {max} стеблей
              </span>
            </InfoRow>
          )}
          <InfoRow label="Цена">
            <span style={{ color: 'var(--accent)', fontWeight: 700 }}>
              {item.price.toLocaleString('ru-RU')} ₸/стебель
            </span>
          </InfoRow>
          <InfoRow label="Пачка">
            {(item.price * item.pack_size).toLocaleString('ru-RU')} ₸
          </InfoRow>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              display: 'flex', alignItems: 'center',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-btn)', overflow: 'hidden', width: 108,
            }}>
              <button
                onClick={() => onSetQty(qty - item.pack_size)}
                disabled={!inCart}
                style={{
                  width: 32, height: 32, border: 'none',
                  background: 'var(--bg2)', color: 'var(--accent)',
                  fontSize: 15, fontWeight: 700,
                  cursor: inCart ? 'pointer' : 'default',
                  opacity: inCart ? 1 : 0.35,
                }}
              >−</button>
              <span style={{
                flex: 1, textAlign: 'center', fontSize: 12, fontWeight: 700,
                borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)',
                lineHeight: '32px',
              }}>
                {qty}
              </span>
              <button
                onClick={() => onSetQty(qty + item.pack_size)}
                disabled={!canInc}
                style={{
                  width: 32, height: 32, border: 'none',
                  background: 'var(--bg2)', color: 'var(--accent)',
                  fontSize: 15, fontWeight: 700,
                  cursor: canInc ? 'pointer' : 'default',
                  opacity: canInc ? 1 : 0.35,
                }}
              >+</button>
            </div>
            {inCart && (
              <span style={{ fontSize: 11, color: 'var(--text-mid)' }}>
                = {(qty * item.price).toLocaleString('ru-RU')} ₸
              </span>
            )}
          </div>

          {inCart ? (
            <>
              <div style={{
                padding: '6px 10px', background: 'var(--accent-light)',
                borderRadius: 'var(--radius-btn)', fontSize: 11,
                color: 'var(--accent)', fontWeight: 600, textAlign: 'center',
              }}>
                В корзине · {(qty * item.price).toLocaleString('ru-RU')} ₸
              </div>
              <button
                onClick={onGoToCart}
                style={{
                  width: '100%', height: 36,
                  background: 'var(--accent)', color: '#fff', border: 'none',
                  borderRadius: 'var(--radius-btn)', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                Перейти в корзину →
              </button>
            </>
          ) : (
            <button
              onClick={() => onSetQty(min)}
              style={{
                width: '100%', height: 36,
                background: 'var(--accent)', color: '#fff', border: 'none',
                borderRadius: 'var(--radius-btn)', fontSize: 13, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              В корзину
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Right panel: cart ──────────────────────────────────────────────────────

function PreorderCartView({
  cart, onSetQtyById, campaignId, onOrdered,
}: {
  cart: CartItem[]
  onSetQtyById: (itemId: number, qty: number) => void
  campaignId: number
  onOrdered: (orderId: number, total: number) => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const cartTotal = cart.reduce((s, i) => s + i.price * i.qty, 0)

  async function handleCheckout() {
    setLoading(true)
    setError('')
    const result = await checkoutPreorder({
      campaign_id: campaignId,
      items: cart.map(i => ({ campaign_item_id: i.campaign_item_id, qty: i.qty })),
    })
    setLoading(false)
    if (result.error) { setError(result.error); return }
    onOrdered(result.order_id ?? 0, result.total ?? 0)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{
        padding: '14px 16px 12px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
      }}>
        <span style={{ fontFamily: 'var(--font-playfair)', fontSize: 15, fontWeight: 400 }}>
          Корзина
        </span>
        {cart.length > 0 && (
          <span style={{
            background: 'var(--accent)', color: '#fff',
            fontSize: 10, fontWeight: 700, borderRadius: '50%',
            width: 18, height: 18,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {cart.length}
          </span>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
        {cart.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-mid)', fontSize: 13, paddingTop: 48 }}>
            Корзина пуста
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {cart.map(item => (
              <div key={item.campaign_item_id} style={{
                background: 'var(--bg2)', borderRadius: 'var(--radius-card)', padding: '8px 10px',
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 12, fontWeight: 500, lineHeight: 1.3,
                      overflow: 'hidden', display: '-webkit-box',
                      WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                    }}>
                      {item.label}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-mid)' }}>
                      {item.price.toLocaleString('ru-RU')} ₸/стебель
                    </div>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 500, flexShrink: 0 }}>
                    {(item.price * item.qty).toLocaleString('ru-RU')} ₸
                  </div>
                  <button
                    onClick={() => onSetQtyById(item.campaign_item_id, 0)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: '#E53935', fontSize: 16, lineHeight: 1,
                      padding: '0 2px', flexShrink: 0,
                    }}
                  >×</button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                  <div style={{
                    display: 'flex', alignItems: 'center',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-btn)', overflow: 'hidden',
                  }}>
                    <button
                      onClick={() => onSetQtyById(item.campaign_item_id, item.qty - item.pack_size)}
                      style={{ width: 24, height: 24, border: 'none', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}
                    >−</button>
                    <span style={{
                      padding: '0 8px', fontSize: 11, fontWeight: 700,
                      borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)',
                    }}>
                      {item.qty}
                    </span>
                    <button
                      onClick={() => onSetQtyById(item.campaign_item_id, item.qty + item.pack_size)}
                      disabled={item.available !== null && item.qty + item.pack_size > item.available}
                      style={{
                        width: 24, height: 24, border: 'none', background: '#fff',
                        cursor: item.available !== null && item.qty + item.pack_size > item.available ? 'default' : 'pointer',
                        fontSize: 12, fontWeight: 700, color: 'var(--accent)',
                        opacity: item.available !== null && item.qty + item.pack_size > item.available ? 0.35 : 1,
                      }}
                    >+</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {cart.length > 0 && (
        <div style={{ padding: '12px 14px 16px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Итого:</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent)' }}>
              {cartTotal.toLocaleString('ru-RU')} ₸
            </span>
          </div>
          {error && (
            <div style={{ fontSize: 11, color: '#E53935', marginBottom: 8 }}>{error}</div>
          )}
          <button
            onClick={handleCheckout}
            disabled={loading}
            style={{
              width: '100%', padding: '10px 14px',
              background: 'var(--accent)', color: '#fff', border: 'none',
              borderRadius: 'var(--radius-btn)', fontSize: 13, fontWeight: 600,
              cursor: loading ? 'default' : 'pointer',
              fontFamily: 'inherit', opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Оформляем...' : '✅ Оформить предзаказ'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function PreorderRoomPage() {
  const { id } = useParams<{ id: string }>()
  const supabase = createClient()
  const COOKIE_KEY = `preorder_token_${id}`
  const isMobile = useIsMobile()

  const [phase, setPhase] = useState<Phase>('checking')
  const [items, setItems] = useState<RoomItem[]>([])
  const [title, setTitle] = useState('')
  const [deliveryDate, setDeliveryDate] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [phone, setPhone] = useState('')
  const [guestName, setName] = useState('')
  const [error, setError] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [cart, setCart] = useState<CartItem[]>([])
  const [orderId, setOrderId] = useState<number | null>(null)
  const [orderTotal, setOrderTotal] = useState(0)

  const [rightPanel, setRightPanel] = useState<RightPanel>('empty')
  const [selectedItem, setSelectedItem] = useState<RoomItem | null>(null)

  const [selectedDates, setSelectedDates] = useState<string[]>([])
  const [selectedTypes, setSelectedTypes] = useState<string[]>([])
  const [priceSort, setPriceSort] = useState<'' | 'asc' | 'desc'>('')
  const [isFilterOpen, setIsFilterOpen] = useState(false)

  // ── cookie helpers ──────────────────────────────────────────────────────

  function getCookie(key: string) {
    return document.cookie.split('; ').find(r => r.startsWith(key + '='))?.split('=')[1] ?? null
  }

  function setCookieValue(key: string, value: string, days = 7) {
    const exp = new Date(Date.now() + days * 864e5).toUTCString()
    document.cookie = `${key}=${value}; expires=${exp}; path=/; SameSite=Strict`
  }

  async function loadRoom(token: string) {
    const { data: rows } = await supabase
      .rpc('get_preorder_room', { p_campaign_id: parseInt(id), p_token: token })
    if (!rows?.length) { setPhase('join'); return }
    const { data: campaign } = await supabase
      .from('campaigns').select('title, delivery_date').eq('id', parseInt(id)).single()
    setTitle(campaign?.title ?? 'Предзаказ')
    setDeliveryDate((campaign as any)?.delivery_date ?? null)
    setItems(rows as RoomItem[])
    setPhase('room')
  }

  useEffect(() => {
    const saved = getCookie(COOKIE_KEY)
    if (saved) { loadRoom(saved) } else { setPhase('join') }
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  function startPolling(ph: string) {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      const res = await fetch(`/api/preorder/${id}/status?phone=${encodeURIComponent(ph)}`)
      const data = await res.json()
      if (data.status === 'approved' && data.access_token) {
        clearInterval(pollRef.current!)
        setCookieValue(COOKIE_KEY, data.access_token)
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

  // ── cart helpers ──────────────────────────────────────────────────────────

  function getQty(itemId: number) {
    return cart.find(c => c.campaign_item_id === itemId)?.qty ?? 0
  }

  function setQty(item: RoomItem, newQty: number) {
    const label = item.display_name ?? item.name
    const min = item.min_qty ?? item.pack_size
    if (newQty < min) {
      setCart(c => c.filter(i => i.campaign_item_id !== item.id))
      return
    }
    const max = item.oz_available_stems
    const clamped = max !== null ? Math.min(newQty, max) : newQty
    setCart(c => {
      const exists = c.find(i => i.campaign_item_id === item.id)
      if (exists) return c.map(i => i.campaign_item_id === item.id ? { ...i, qty: clamped } : i)
      return [...c, {
        campaign_item_id: item.id, label, price: item.price,
        qty: clamped, pack_size: item.pack_size, available: item.oz_available_stems,
      }]
    })
  }

  function setQtyById(itemId: number, newQty: number) {
    const item = items.find(i => i.id === itemId)
    if (item) setQty(item, newQty)
  }

  // ── filtered items ────────────────────────────────────────────────────────

  const filtered = items

    .filter(i => selectedTypes.length === 0 || (i.oz_stock_type !== null && selectedTypes.includes(i.oz_stock_type)))
    .sort((a, b) => {
      if (priceSort === 'asc') return a.price - b.price
      if (priceSort === 'desc') return b.price - a.price
      return 0
    })

  const cartTotal = cart.reduce((s, i) => s + i.price * i.qty, 0)
  const cartCount = cart.length
  const activeFilterCount = selectedTypes.length + (priceSort !== '' ? 1 : 0)

  // ── simple phases ─────────────────────────────────────────────────────────

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
          maxLength={6} required
          style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #ddd', fontSize: 18, letterSpacing: 4, textTransform: 'uppercase', textAlign: 'center' }}
        />
        <input
          placeholder="Ваш телефон" value={phone}
          onChange={e => setPhone(e.target.value)} required
          style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14 }}
        />
        <input
          placeholder="Ваше имя / компания" value={guestName}
          onChange={e => setName(e.target.value)}
          style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14 }}
        />
        {error && <p style={{ color: '#e53e3e', fontSize: 13 }}>{error}</p>}
        <button
          type="submit"
          style={{ padding: 12, borderRadius: 8, background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 15, cursor: 'pointer' }}
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
      <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)', marginBottom: 16 }}>
        {orderTotal.toLocaleString('ru-RU')} ₸
      </p>
      <p style={{ color: '#666', fontSize: 14, marginBottom: 24 }}>
        Ожидайте звонка менеджера для подтверждения поставки.
      </p>
      <button
        onClick={() => { setCart([]); setRightPanel('empty'); setSelectedItem(null); setPhase('room') }}
        style={{ padding: '10px 24px', borderRadius: 8, background: '#f5f5f5', border: 'none', fontSize: 14, cursor: 'pointer' }}
      >
        ← Назад к витрине
      </button>
    </div>
  )

  // ── Room: 3-column layout ─────────────────────────────────────────────────

  const HEADER_H = 104

  const leftContent = (
    <PreorderFilters
      items={items}
      selectedDates={selectedDates} setSelectedDates={setSelectedDates}
      selectedTypes={selectedTypes} setSelectedTypes={setSelectedTypes}
      priceSort={priceSort} setPriceSort={setPriceSort}
    />
  )

  const centerContent = (
    <div style={{ padding: '16px 16px 24px' }}>
      <div style={{ marginBottom: 12 }}>
        <h1 style={{ fontSize: 18, fontFamily: 'var(--font-playfair)', fontWeight: 400, marginBottom: 4 }}>
          {title}
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {deliveryDate && (
            <span style={{
              fontSize: 12, fontWeight: 600, color: 'var(--accent)',
              background: 'var(--accent-light)', borderRadius: 6,
              padding: '2px 10px', border: '1px solid var(--accent-mid)',
            }}>
              Поставка: {fmtDate(deliveryDate)}
            </span>
          )}
          <span style={{ fontSize: 12, color: 'var(--text-mid)' }}>
            {filtered.length} позиций
            {filtered.length !== items.length && ` (из ${items.length})`}
          </span>
        </div>
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
        gap: 12,
      }}>
        {filtered.map(item => (
          <PreorderCard
            key={item.id}
            item={item}
            qty={getQty(item.id)}
            onSetQty={n => setQty(item, n)}
            isSelected={selectedItem?.id === item.id}
            onClick={() => {
              setSelectedItem(item)
              setRightPanel('detail')
            }}
            onCartOpen={() => setRightPanel('cart')}
          />
        ))}
      </div>
    </div>
  )

  const rightContent = rightPanel === 'cart' ? (
    <PreorderCartView
      cart={cart}
      onSetQtyById={setQtyById}
      campaignId={parseInt(id)}
      onOrdered={(oid, total) => {
        setOrderId(oid); setOrderTotal(total)
        setCart([]); setPhase('ordered')
      }}
    />
  ) : rightPanel === 'detail' && selectedItem ? (
    <PreorderDetailView
      item={selectedItem}
      qty={getQty(selectedItem.id)}
      onSetQty={n => setQty(selectedItem, n)}
      onGoToCart={() => setRightPanel('cart')}
      onClose={() => { setRightPanel('empty'); setSelectedItem(null) }}
    />
  ) : (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100%', padding: 32,
      gap: 14, color: 'var(--text-mid)',
    }}>
      <div style={{ fontSize: 56, opacity: 0.18, lineHeight: 1 }}>🌸</div>
      <p style={{ fontSize: 12, textAlign: 'center', lineHeight: 1.6, maxWidth: 200, margin: 0 }}>
        Нажмите на карточку товара, чтобы увидеть подробности
      </p>
      {cartCount > 0 && (
        <button
          onClick={() => setRightPanel('cart')}
          style={{
            padding: '8px 20px', background: 'var(--accent)', color: '#fff',
            border: 'none', borderRadius: 'var(--radius-btn)',
            fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          Корзина ({cartCount}) · {cartTotal.toLocaleString('ru-RU')} ₸
        </button>
      )}
    </div>
  )

  // Desktop
  if (!isMobile) {
    return (
      <div style={{
        display: 'grid',
        gridTemplateColumns: '200px 1fr 280px',
        height: `calc(100vh - ${HEADER_H}px)`,
      }}>
        <aside style={{ overflowY: 'auto', background: '#fff', borderRight: '1px solid var(--border)' }}>
          {leftContent}
        </aside>
        <main style={{ overflowY: 'auto', background: '#fafafa' }}>
          {centerContent}
        </main>
        <aside style={{ display: 'flex', flexDirection: 'column', background: '#fff', borderLeft: '1px solid var(--border)', overflow: 'hidden' }}>
          {cartCount > 0 && (
            <button
              onClick={() => setRightPanel('cart')}
              style={{
                flexShrink: 0, width: '100%',
                padding: '9px 14px',
                background: 'var(--accent-light)',
                borderTop: 'none', borderRight: 'none', borderLeft: 'none',
                borderBottom: '1px solid var(--accent-mid)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 5 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
                  <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
                </svg>
                {cartCount} поз.
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>
                {cartTotal.toLocaleString('ru-RU')} ₸
              </span>
            </button>
          )}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {rightContent}
          </div>
        </aside>
      </div>
    )
  }

  // Mobile
  const isSheetOpen = isMobile && rightPanel !== 'empty'

  return (
    <div style={{ height: `calc(100vh - ${HEADER_H}px)`, position: 'relative', overflow: 'hidden' }}>
      {/* Center */}
      <div style={{ height: '100%', overflowY: 'auto', paddingBottom: 72, background: '#fafafa' }}>
        {centerContent}
      </div>

      {/* Filter backdrop */}
      {isFilterOpen && (
        <div
          onClick={() => setIsFilterOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 49 }}
        />
      )}
      {/* Filter sheet */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        height: '85vh', background: '#fff',
        borderRadius: '16px 16px 0 0',
        transform: isFilterOpen ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 0.3s ease',
        zIndex: 50, display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 4px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: '#ddd' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border)', padding: '8px 12px', flexShrink: 0 }}>
          <button
            onClick={() => setIsFilterOpen(false)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: 13, fontFamily: 'inherit', fontWeight: 500 }}
          >
            ← Витрина
          </button>
          <span style={{ fontFamily: 'var(--font-playfair)', fontSize: 15, marginLeft: 4 }}>Фильтры</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>{leftContent}</div>
        <div style={{ padding: '10px 14px 16px', borderTop: '1px solid var(--border)' }}>
          <button
            onClick={() => setIsFilterOpen(false)}
            style={{ width: '100%', padding: 12, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Показать {filtered.length} позиций
          </button>
        </div>
      </div>

      {/* Detail/cart backdrop */}
      {isSheetOpen && (
        <div
          onClick={() => { setRightPanel('empty'); setSelectedItem(null) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 49 }}
        />
      )}
      {/* Detail/cart sheet */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        height: '85vh', background: '#fff',
        borderRadius: '16px 16px 0 0',
        transform: isSheetOpen ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 0.3s ease',
        zIndex: 50, display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 4px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: '#ddd' }} />
        </div>
        <div style={{ borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <button
            onClick={() => { setRightPanel('empty'); setSelectedItem(null) }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: 13, padding: '8px 12px', fontFamily: 'inherit', fontWeight: 500 }}
          >
            ← Витрина
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>{rightContent}</div>
      </div>

      {/* Bottom bar */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 40,
        background: '#fff', borderTop: '0.5px solid var(--border)',
        padding: '8px 12px', display: 'flex', gap: 8,
      }}>
        <button
          onClick={() => setIsFilterOpen(true)}
          style={{
            flex: 1, background: 'var(--accent-light)', color: 'var(--accent)',
            border: '0.5px solid var(--accent-mid)', borderRadius: 6,
            padding: '10px', fontSize: 13, fontWeight: 500,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="4" y1="6" x2="20" y2="6"/>
            <line x1="8" y1="12" x2="16" y2="12"/>
            <line x1="11" y1="18" x2="13" y2="18"/>
          </svg>
          Фильтры{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
        </button>
        {cartCount > 0 && (
          <button
            onClick={() => setRightPanel('cart')}
            style={{
              flex: 1, background: 'var(--accent)', color: '#fff',
              border: 'none', borderRadius: 6,
              padding: '10px', fontSize: 13, fontWeight: 500,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Корзина ({cartCount}) · {cartTotal.toLocaleString('ru-RU')} ₸
          </button>
        )}
      </div>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { useDetailStore } from '@/lib/detail-store'
import { useCart } from '@/lib/cart-store'
import { useAuthStore } from '@/lib/auth-store'
import { useProductsStore } from '@/lib/products-store'
import { type Product, getAvailable, getPrice } from './ProductCard'
import AuthModal from './AuthModal'
import { COLORS } from '@/lib/colors'


const FLORAL_ROLE_MAP: Record<string, { label: string; icon: string }> = {
  focal:   { label: 'Фокусный',    icon: '🌹' },
  mass:    { label: 'Массовый',    icon: '🌸' },
  line:    { label: 'Линейный',    icon: '🌿' },
  filler:  { label: 'Наполнитель', icon: '🍃' },
  texture: { label: 'Текстура',    icon: '✨' },
  foliage: { label: 'Зелень',      icon: '🌱' },
}

const ORIGIN_MAP: Record<string, string> = {
  ecuador:  'Эквадор',
  kenya:    'Кения',
  holland:  'Голландия',
  china:    'Китай',
  colombia: 'Колумбия',
  local:    'Местный',
}

const SEASON_MAP: Record<string, string> = {
  year_round: 'Круглый год',
  year:       'Круглый год',
  spring:     'Весна',
  summer:     'Лето',
  autumn:     'Осень',
  winter:     'Зима',
}

const DURATION_MAP: Record<string, string> = {
  '3-5': '3–5 дней',
  '5-7': '5–7 дней',
  '7+':  '7+ дней',
}

// ── primitives ───────────────────────────────────────────────────────────────

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 6,
      padding: '4px 0', borderBottom: '1px solid var(--border)',
    }}>
      <span style={{
        fontSize: 11, color: 'var(--text-mid)',
        minWidth: 80, flexShrink: 0, paddingTop: 1,
      }}>
        {label}
      </span>
      <span style={{ fontSize: 11, color: 'var(--text)', fontWeight: 500 }}>{children}</span>
    </div>
  )
}

function Stepper({ qty, available, packSize, onDec, onInc }: {
  qty: number; available: number; packSize: number
  onDec: () => void; onInc: () => void
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      border: '1px solid var(--border)', borderRadius: 'var(--radius-btn)',
      overflow: 'hidden', width: 108,
    }}>
      <button
        onClick={onDec} disabled={qty === 0}
        style={{
          width: 32, height: 32, border: 'none',
          background: 'var(--bg2)', color: 'var(--accent)',
          fontSize: 15, fontWeight: 700,
          cursor: qty === 0 ? 'default' : 'pointer',
          opacity: qty === 0 ? 0.35 : 1,
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
        onClick={onInc} disabled={qty >= available}
        style={{
          width: 32, height: 32, border: 'none',
          background: 'var(--bg2)', color: 'var(--accent)',
          fontSize: 15, fontWeight: 700,
          cursor: qty >= available ? 'default' : 'pointer',
          opacity: qty >= available ? 0.35 : 1,
        }}
      >+</button>
    </div>
  )
}

// ── State A: empty ───────────────────────────────────────────────────────────

function StateEmpty() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100%', padding: 32,
      gap: 14, color: 'var(--text-mid)',
    }}>
      <div style={{ fontSize: 56, opacity: 0.18, lineHeight: 1 }}>🌸</div>
      <p style={{ fontSize: 12, textAlign: 'center', lineHeight: 1.6, maxWidth: 200, margin: 0 }}>
        Нажмите на карточку товара, чтобы увидеть подробности
      </p>
    </div>
  )
}

// ── State B: product detail ──────────────────────────────────────────────────

function StateDetail({ product, onGoToCart }: { product: Product; onGoToCart: () => void }) {
  const { items, add, update, total } = useCart()
  const { isAuthed } = useAuthStore()
  const [showAuth, setShowAuth] = useState(false)
  const [photoIdx, setPhotoIdx] = useState(0)

  const available = getAvailable(product.stock)
  const price = getPrice(product.stock)
  const packSize = product.pack_size || 5
  const cartItem = items.find(i => i.id === product.id)
  const qty = cartItem?.qty ?? 0
  const inCart = qty > 0
  const cartTotal = qty * price
  const cartCount = items.reduce((s, i) => s + i.qty, 0)
  const cartSum = total()

  const images: string[] = product.images?.length
    ? product.images
    : product.image_url ? [product.image_url] : []
  const mainPhoto = images[photoIdx] ?? null

  const displayName = product.variety_name || product.name
  const originLabel = product.origin ? (ORIGIN_MAP[product.origin] ?? product.origin) : null
  const metaParts = [
    product.length_cm ? `${product.length_cm} см` : product.length_str,
    originLabel,
  ].filter(Boolean)

  const colorKeys = product.colors?.length ? product.colors : product.color ? [product.color] : []
  const colorDefs = colorKeys.map(k => COLORS.find(c => c.key === k)).filter(Boolean) as typeof COLORS[number][]
  const availColor = available > 30 ? '#388E3C' : available >= 10 ? '#F9A825' : '#E53935'
  const floralRole = product.floral_role ? FLORAL_ROLE_MAP[product.floral_role] : null

  const seasons = Array.isArray(product.season)
    ? product.season as string[]
    : (product.season || '').split(',').map((s: string) => s.trim()).filter(Boolean)
  const seasonLabel = seasons.map(s => SEASON_MAP[s] ?? s).filter(Boolean).join(', ')

  function handleDec() {
    if (!isAuthed) { setShowAuth(true); return }
    update(product.id, Math.max(0, qty - packSize))
  }

  function handleInc() {
    if (!isAuthed) { setShowAuth(true); return }
    if (qty === 0) {
      add({
        id: product.id,
        name: displayName + (product.length_str ? ' ' + product.length_str : ''),
        price, available, category: product.category, image_url: product.image_url,
      })
      update(product.id, packSize)
    } else {
      update(product.id, Math.min(qty + packSize, available))
    }
  }

  function handleAddToCart() {
    if (!isAuthed) { setShowAuth(true); return }
    if (qty === 0) {
      add({
        id: product.id,
        name: displayName + (product.length_str ? ' ' + product.length_str : ''),
        price, available, category: product.category, image_url: product.image_url,
      })
      update(product.id, packSize)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 104px)', overflowY: 'auto' }}>

      {/* Gallery */}
      <div style={{ flexShrink: 0 }}>
        <div style={{ aspectRatio: '3/2', background: 'var(--bg2)', overflow: 'hidden', position: 'relative' }}>
          {mainPhoto ? (
            <img src={mainPhoto} alt={displayName} style={{ width: '100%', height: '100%', objectFit: 'contain', background: 'var(--bg2)' }} />
          ) : (
            <div style={{
              width: '100%', height: '100%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 64, opacity: 0.18,
              background: 'repeating-linear-gradient(-45deg,transparent 0 8px,rgba(139,58,90,0.04) 8px 16px)',
            }}>
              🌸
            </div>
          )}
        </div>
        {images.length > 1 && (
          <div style={{ display: 'flex', gap: 6, padding: '8px 12px', overflowX: 'auto' }}>
            {images.map((img, i) => (
              <button
                key={i} onClick={() => setPhotoIdx(i)}
                style={{
                  width: 52, height: 52, borderRadius: 6, overflow: 'hidden',
                  flexShrink: 0, padding: 0, cursor: 'pointer', background: 'none',
                  border: `2px solid ${i === photoIdx ? 'var(--accent)' : 'transparent'}`,
                }}
              >
                <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: '12px 12px 16px 12px', display: 'flex', flexDirection: 'column' }}>

        {/* Name */}
        <div style={{
          fontFamily: 'var(--font-playfair)', fontSize: 14, fontWeight: 400,
          lineHeight: 1.35, color: 'var(--text)', marginBottom: 3,
          overflow: 'hidden', display: '-webkit-box',
          WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        }}>
          {displayName}
        </div>

        {/* Meta */}
        {metaParts.length > 0 && (
          <div style={{ fontSize: 11, color: 'var(--text-mid)', marginBottom: 8 }}>
            {metaParts.join(' · ')}
          </div>
        )}

        {/* Characteristics */}
        <div style={{ marginBottom: 12 }}>

          {colorDefs.length > 0 && (
            <Row label="Цвет">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                {colorDefs.map(col => (
                  <span key={col.key} title={col.label} style={{
                    width: 14, height: 14, borderRadius: '50%', flexShrink: 0, display: 'inline-block',
                    background: ('gradient' in col ? col.gradient : col.bg) as string,
                    border: '1px solid rgba(0,0,0,0.15)',
                  }} />
                ))}
                {colorDefs.length === 1 && (
                  <span>{colorDefs[0].label}</span>
                )}
              </span>
            </Row>
          )}

          <Row label="Цена">
            {isAuthed ? (
              <span style={{ color: 'var(--accent)', fontWeight: 700 }}>
                {price.toLocaleString('ru-RU')} ₸/шт
              </span>
            ) : (
              <span style={{ color: '#ccc', letterSpacing: '0.12em', userSelect: 'none' }}>●●● ₸</span>
            )}
          </Row>

          <Row label="Кратность">{packSize} шт</Row>

          {isAuthed && (
            <Row label="Остаток">
              <span style={{ color: availColor, fontWeight: 700 }}>{available} шт</span>
            </Row>
          )}

          {floralRole && (
            <Row label="Роль">{floralRole.icon} {floralRole.label}</Row>
          )}


          {seasonLabel && (
            <Row label="Сезон">{seasonLabel}</Row>
          )}

          {originLabel && !metaParts.includes(originLabel) && (
            <Row label="Источник">{originLabel}</Row>
          )}

          {product.description && (
            <div style={{ paddingTop: 10, fontSize: 12, color: 'var(--text-mid)', lineHeight: 1.55 }}>
              {product.description}
            </div>
          )}
        </div>

        {/* Stepper + Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Stepper qty={qty} available={available} packSize={packSize} onDec={handleDec} onInc={handleInc} />
            {inCart && isAuthed && (
              <span style={{ fontSize: 11, color: 'var(--text-mid)' }}>
                = {cartTotal.toLocaleString('ru-RU')} ₸
              </span>
            )}
          </div>

          {inCart && isAuthed ? (
            <>
              <div style={{
                padding: '6px 10px',
                background: 'var(--accent-light)', borderRadius: 'var(--radius-btn)',
                fontSize: 11, color: 'var(--accent)', fontWeight: 600, textAlign: 'center',
              }}>
                В корзине · {cartTotal.toLocaleString('ru-RU')} ₸
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
            <>
              <button
                onClick={handleAddToCart}
                disabled={available === 0}
                style={{
                  width: '100%', height: 36,
                  background: available === 0 ? 'var(--bg2)' : 'var(--accent)',
                  color: available === 0 ? 'var(--text-mid)' : '#fff',
                  border: 'none', borderRadius: 'var(--radius-btn)',
                  fontSize: 13, fontWeight: 600,
                  cursor: available === 0 ? 'default' : 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {available === 0 ? 'Нет в наличии' : 'Добавить в корзину'}
              </button>
              {cartCount > 0 && (
                <button
                  onClick={onGoToCart}
                  style={{
                    width: '100%', padding: '7px 0',
                    background: 'none', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-btn)', fontSize: 12,
                    cursor: 'pointer', color: 'var(--text-mid)', fontFamily: 'inherit',
                  }}
                >
                  🛒 Корзина ({cartCount}) · {cartSum.toLocaleString('ru-RU')} ₸ →
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {showAuth && (
        <AuthModal onClose={() => setShowAuth(false)} onSuccess={() => setShowAuth(false)} />
      )}
    </div>
  )
}

// ── State C: cart ────────────────────────────────────────────────────────────

function StateCart({ onBack }: { onBack: () => void }) {
  const { product, setProduct } = useDetailStore()
  const { items, remove, update, clear, total } = useCart()
  const { phone } = useAuthStore()
  const { products } = useProductsStore()
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [stockError, setStockError] = useState('')
  const [whatsappUrl, setWhatsappUrl] = useState('')
  const [showAuth, setShowAuth] = useState(false)
  const [hoveredId, setHoveredId] = useState<number | null>(null)

  function openProduct(id: number) {
    const p = products.find(x => x.id === id)
    if (p) setProduct(p) // setProduct already switches panel to 'detail'
  }

  const count = items.reduce((s, i) => s + i.qty, 0)

  async function submitOrder() {
    if (!phone) { setShowAuth(true); return }
    setLoading(true)
    setStockError('')

    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: items.map(i => ({ id: i.id, qty: i.qty, price: i.price, name: i.name })),
        phone,
      }),
    })

    if (!res.ok) {
      const data = await res.json()
      setStockError(data.error ?? 'Ошибка при оформлении заказа')
      setLoading(false)
      return
    }

    const { order_id, is_new_order } = await res.json()
    const totalVal = total()
    const msgHeader = is_new_order ? `🌸 Новый заказ #${order_id}` : `🌸 Обновление заказа #${order_id}`
    const msg = msgHeader + '\n\n' +
      items.map(i => `• ${i.name} × ${i.qty} шт = ${(i.price * i.qty).toLocaleString('ru-RU')} ₸`).join('\n') +
      `\n\nИтого: ${totalVal.toLocaleString('ru-RU')} ₸\n\nКлиент: ${phone}`

    setWhatsappUrl(`https://wa.me/77007575243?text=${encodeURIComponent(msg)}`)
    clear()
    setDone(true)
    setLoading(false)
  }

  if (done) {
    return (
      <div style={{ padding: '32px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        <div style={{ fontSize: 48 }}>🎉</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Заказ оформлен!</div>
        <div style={{ fontSize: 12, color: 'var(--text-mid)', textAlign: 'center', lineHeight: 1.5 }}>
          Менеджер получит уведомление и свяжется с вами.
        </div>
        <button
          onClick={() => window.open(whatsappUrl, '_blank')}
          style={{
            width: '100%', padding: '10px 14px', marginTop: 4,
            background: '#25D366', color: '#fff', border: 'none',
            borderRadius: 'var(--radius-btn)', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          📲 Открыть WhatsApp
        </button>
        <button
          onClick={() => { setDone(false); onBack() }}
          style={{
            width: '100%', padding: '9px 14px',
            background: 'var(--bg2)', color: 'var(--text)', border: 'none',
            borderRadius: 'var(--radius-btn)', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          Отлично!
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        padding: '14px 16px 12px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
      }}>
        {product && (
          <button
            onClick={onBack}
            style={{
              background: '#F7EEF2', border: '1px solid var(--accent-mid)',
              cursor: 'pointer', color: 'var(--accent)', fontSize: 11, fontWeight: 500,
              fontFamily: 'inherit', padding: '3px 10px',
              borderRadius: 'var(--radius-btn)',
              display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0,
            }}
          >
            ← К товару
          </button>
        )}
        <span style={{ fontFamily: 'var(--font-playfair)', fontSize: 15, fontWeight: 400, marginLeft: product ? 4 : 0 }}>
          Корзина
        </span>
        {count > 0 && (
          <span style={{
            background: 'var(--accent)', color: '#fff', fontSize: 10, fontWeight: 700,
            borderRadius: '50%', width: 18, height: 18,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {count}
          </span>
        )}
      </div>

      {/* Items */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
        {items.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-mid)', fontSize: 13, paddingTop: 48 }}>
            Корзина пуста
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {items.map(item => (
              <div key={item.id} style={{
                background: 'var(--bg2)', borderRadius: 'var(--radius-card)', padding: '8px 10px',
              }}>
                {/* Row: thumbnail + name/price + total */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  {item.image_url ? (
                    <img src={item.image_url} style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 36, height: 36, borderRadius: 4, background: 'var(--accent-light)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>
                      🌸
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      onClick={() => openProduct(item.id)}
                      onMouseEnter={() => setHoveredId(item.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      style={{
                        fontSize: 12, fontWeight: 500, lineHeight: 1.3,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        cursor: 'pointer',
                        color: hoveredId === item.id ? 'var(--accent)' : 'var(--text)',
                        transition: 'color 0.15s',
                      }}
                    >
                      {item.name}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-mid)' }}>
                      {item.price.toLocaleString('ru-RU')} ₸/шт
                    </div>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 500, flexShrink: 0 }}>
                    {(item.price * item.qty).toLocaleString('ru-RU')} ₸
                  </div>
                  <button
                    onClick={() => remove(item.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#E53935', fontSize: 16, lineHeight: 1, padding: '0 2px', flexShrink: 0 }}
                  >×</button>
                </div>
                {/* Stepper */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                  <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border)', borderRadius: 'var(--radius-btn)', overflow: 'hidden' }}>
                    <button onClick={() => update(item.id, item.qty - 1)} style={{ width: 24, height: 24, border: 'none', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>−</button>
                    <span style={{ padding: '0 8px', fontSize: 11, fontWeight: 700, borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)' }}>{item.qty}</span>
                    <button onClick={() => update(item.id, Math.min(item.qty + 1, item.available))} style={{ width: 24, height: 24, border: 'none', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>+</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {items.length > 0 && (
        <div style={{ padding: '12px 14px 16px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Итого:</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent)' }}>
              {total().toLocaleString('ru-RU')} ₸
            </span>
          </div>
          {stockError && (
            <div style={{ fontSize: 11, color: '#E53935', marginBottom: 8 }}>{stockError}</div>
          )}
          <button
            onClick={submitOrder} disabled={loading}
            style={{
              width: '100%', padding: '10px 14px',
              background: 'var(--accent)', color: '#fff', border: 'none',
              borderRadius: 'var(--radius-btn)', fontSize: 13, fontWeight: 600,
              cursor: loading ? 'default' : 'pointer', fontFamily: 'inherit',
              opacity: loading ? 0.7 : 1, marginBottom: 6,
            }}
          >
            {loading ? 'Оформляем...' : '✅ Оформить заказ'}
          </button>
          <button
            onClick={clear}
            style={{
              width: '100%', padding: '8px 14px',
              background: 'none', color: '#E53935', border: 'none',
              borderRadius: 'var(--radius-btn)', fontSize: 12, fontWeight: 500,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Очистить корзину
          </button>
        </div>
      )}

      {showAuth && (
        <AuthModal onClose={() => setShowAuth(false)} onSuccess={() => setShowAuth(false)} />
      )}
    </div>
  )
}

// ── main component ───────────────────────────────────────────────────────────

export default function DetailPanel() {
  const { panel, product, setPanel } = useDetailStore()

  if (panel === 'cart') return <StateCart onBack={() => setPanel('detail')} />
  if (panel === 'detail' && product) return <StateDetail product={product} onGoToCart={() => setPanel('cart')} />
  return <StateEmpty />
}

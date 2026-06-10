'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useDetailStore } from '@/lib/detail-store'
import SwipeToDelete from './SwipeToDelete'
import { useRouter } from 'next/navigation'
import { useCart } from '@/lib/cart-store'
import { useAuthStore } from '@/lib/auth-store'
import { useProductsStore } from '@/lib/products-store'
import { type Product, getAvailable, getPrice } from './ProductCard'
import AuthModal from './AuthModal'
import { COLORS } from '@/lib/colors'
import { COUNTRY_LABELS, countryFlag } from '@/lib/countries'
import { unitForProduct } from '@/lib/category-tree'

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

const POT_COLOR_RU: Record<string, string> = {
  wit: 'белый', zwart: 'чёрный', rood: 'красный', groen: 'зелёный',
  geel: 'жёлтый', oranje: 'оранжевый', roze: 'розовый', paars: 'фиолетовый',
  blauw: 'синий', bruin: 'коричневый', zilver: 'серебряный', grijs: 'серый',
  antraciet: 'антрацит', terracotta: 'терракотовый', beige: 'бежевый',
  creme: 'кремовый', naturel: 'натуральный', transparant: 'прозрачный',
  bordeaux: 'бордовый', lichtgrijs: 'светло-серый', donkergroen: 'тёмно-зелёный',
  mosgroen: 'мшисто-зелёный', taupe: 'тауп', ecru: 'экрю',
}

const POT_MATERIAL_RU: Record<string, string> = {
  plastic: 'пластик',
  kunststof: 'пластик',
  terracotta: 'терракота',
  keramiek: 'керамика',
  'keramiek gedecoreerd': 'керамика (декор)',
  metaal: 'металл',
  bamboe: 'бамбук',
  riet: 'ротанг',
  jute: 'джут',
  hout: 'дерево',
  'gerecyclede pot': 'переработанный пластик',
  gerecycleerd: 'переработанный пластик',
  '>80% Post Consumer Recyclaat (PCR)': 'переработанный пластик (PCR 80%)',
  recyclebaar: 'перерабатываемый',
  kokosvezel: 'кокосовое волокно',
  klei: 'глина',
}

const POT_FORM_RU: Record<string, string> = {
  sierpot: 'декоративный',
  bloempot: 'стандартный',
  kweekpot: 'технический',
  hangpot: 'подвесной',
  baliesbak: 'ящик',
  schaal: 'чаша',
}

const SUBSTRATE_RU: Record<string, string> = {
  potgrond: 'торфяной грунт',
  '100% veen vrij': 'без торфа',
  '70% veen vrij': '70% без торфа',
  '65% veen vrij': '65% без торфа',
  '60% veen vrij': '60% без торфа',
  '55% veen vrij': '55% без торфа',
  '50% veen vrij': 'Экологичный субстрат (50% без торфа)',
  overige: 'другой субстрат',
  hydro: 'гидрогрунт',
  steenwol: 'минвата',
  kokos: 'кокосовый субстрат',
  kokosmengsel: 'кокосовый микс',
  aarde: 'земля',
  lava: 'лавовый грунт',
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

function StateDetail({ product, onGoToCart, onClose }: { product: Product; onGoToCart: () => void; onClose: () => void }) {
  const { items, add, update, total } = useCart()
  const { isAuthed } = useAuthStore()
  const [showAuth, setShowAuth] = useState(false)
  const [photoIdx, setPhotoIdx] = useState(0)
  const [lbOpen, setLbOpen] = useState(false)

  const available = getAvailable(product.stock)
  const price = getPrice(product.stock)
  const packSize = product.pack_size || 5
  const cartItem = items.find(i => i.id === product.id)
  const qty = cartItem?.qty ?? 0
  const inCart = qty > 0
  const cartTotal = qty * price
  const cartCount = items.reduce((s, i) => s + i.qty, 0)
  const cartSum = total()

  const images: string[] = (() => {
    if (product.images?.length) return product.images
    const imgs: string[] = []
    if (product.image_url) imgs.push(product.image_url)
    if (product.campaign_image_url && product.campaign_image_url !== product.image_url) {
      imgs.push(product.campaign_image_url)
    }
    return imgs
  })()
  const mainPhoto = images[photoIdx] ?? null

  const displayName = product.display_name || product.variety_name || product.name
  const countryLabel = product.country_iso
    ? `${countryFlag(product.country_iso)} ${COUNTRY_LABELS[product.country_iso] ?? product.country_iso}`
    : product.origin ? (ORIGIN_MAP[product.origin] ?? product.origin) : null
  type Dim = { type: 'length' | 'diam'; val: string }
  const dims: Dim[] = product.category === 'pot'
    ? [
        product.length_cm ? { type: 'length', val: `${product.length_cm}см` } : null,
        (product as any).pot_diameter ? { type: 'diam', val: `${(product as any).pot_diameter}` } : null,
      ].filter(Boolean) as Dim[]
    : (product.length_cm || product.length_str
        ? [{ type: 'length', val: product.length_cm ? `${product.length_cm}см` : product.length_str! }]
        : [])

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
        unit: (product as any).unit ?? null, subcategory: product.subcategory ?? null,
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
        unit: (product as any).unit ?? null, subcategory: product.subcategory ?? null,
      })
      update(product.id, packSize)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>

      {/* Gallery */}
      <div style={{ flexShrink: 0, padding: '12px 12px 0' }}>
        <div
          style={{ aspectRatio: '3/2', background: 'var(--bg2)', overflow: 'hidden', position: 'relative', borderRadius: 12, cursor: mainPhoto ? 'zoom-in' : 'default' }}
          onClick={() => mainPhoto && setLbOpen(true)}
          onMouseMove={images.length > 1 ? (e) => {
            const { left, width } = e.currentTarget.getBoundingClientRect()
            setPhotoIdx(e.clientX - left > width / 2 ? 1 : 0)
          } : undefined}
          onMouseLeave={images.length > 1 ? () => setPhotoIdx(0) : undefined}
        >
          {mainPhoto ? (
            <Image fill src={mainPhoto} alt={displayName} sizes="(max-width: 768px) 100vw, 50vw" priority style={{ objectFit: 'contain' }} />
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
          {images.length > 1 && (
            <div style={{ position: 'absolute', bottom: 8, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 5 }}>
              {images.map((_, i) => (
                <div key={i} style={{
                  width: i === photoIdx ? 16 : 6, height: 6,
                  borderRadius: 3, background: '#fff',
                  opacity: i === photoIdx ? 0.95 : 0.45,
                  transition: 'width 0.15s, opacity 0.15s',
                }} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '12px 12px 16px 12px', display: 'flex', flexDirection: 'column' }}>

        {/* Name */}
        <a
          href={`/product/${product.id}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontFamily: 'var(--font-golos)', fontSize: 14, fontWeight: 600,
            lineHeight: 1.35, color: 'var(--text)', marginBottom: 2,
            overflow: 'hidden', display: '-webkit-box',
            WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            textDecoration: 'none',
          }}
          onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
          onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
        >
          {displayName}
        </a>
        {displayName !== product.name && !/^\d+$/.test(product.name) && (
          <div style={{ fontSize: 11, color: 'var(--text-mid)', marginBottom: 2 }}>
            {product.name}
          </div>
        )}
        {(product as any).variant && (
          <div style={{ fontSize: 11, color: 'var(--text-mid)', fontStyle: 'italic', marginBottom: 4 }}>
            {(product as any).variant}
          </div>
        )}

        {/* Размеры */}
        {dims.length > 0 && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', marginBottom: 6 }}>
            {dims.map((d, i) => (
              <span key={i} style={{ fontSize: 12, color: 'var(--text-mid)', display: 'inline-flex', alignItems: 'baseline', gap: 3 }}>
                {d.type === 'length'
                  ? <><span style={{ fontSize: 14 }}>↕</span>{d.val}</>
                  : <><span style={{ fontSize: 21, lineHeight: 1 }}>⌀</span>{d.val}</>}
              </span>
            ))}
          </div>
        )}

        {/* Страна + ферма */}
        {(countryLabel || (product as any).farm) && (
          <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {countryLabel && (
              <span style={{
                fontSize: 11, color: '#5B7BA0', background: 'rgba(91,123,160,0.1)',
                borderRadius: 4, padding: '2px 8px', fontWeight: 500,
              }}>
                {countryLabel}
              </span>
            )}
            {(product as any).farm && (
              <span style={{ fontSize: 11, color: 'var(--text-mid)', fontStyle: 'italic' }}>
                {(product as any).farm}
              </span>
            )}
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
            {(isAuthed || product.category === 'accessories') ? (
              <span style={{ color: 'var(--accent)', fontWeight: 700 }}>
                {price.toLocaleString('ru-RU')} ₸/{unitForProduct(product as any)}
              </span>
            ) : (
              <span style={{ color: '#ccc', letterSpacing: '0.12em', userSelect: 'none' }}>●●● ₸</span>
            )}
          </Row>

          <Row label="Кратность">{packSize} {unitForProduct(product as any)}</Row>

          {((product as any).price_per_m || (product as any).price_per_m2) && (
            <div style={{ fontSize: 11, color: 'var(--text-mid)', marginTop: 4 }}>
              {(product as any).price_per_m && `${Number((product as any).price_per_m).toLocaleString('ru-RU')} ₸/пог.м`}
              {(product as any).price_per_m && (product as any).price_per_m2 && ' · '}
              {(product as any).price_per_m2 && `${Number((product as any).price_per_m2).toLocaleString('ru-RU')} ₸/м²`}
            </div>
          )}

          {product.stems_per_pack && product.stems_per_pack > 0 && (
            <Row label="Стеблей в уп.">{product.stems_per_pack} шт</Row>
          )}

          {(product as any).weight_gram && (
            <Row label="Вес">{(product as any).weight_gram} г</Row>
          )}

          {isAuthed && (
            <Row label="Наличие на складе">
              <span style={{ color: availColor, fontWeight: 700 }}>{available} {unitForProduct(product as any)}</span>
            </Row>
          )}

          {floralRole && (
            <Row label="Роль">{floralRole.icon} {floralRole.label}</Row>
          )}


          {seasonLabel && (
            <Row label="Сезон">{seasonLabel}</Row>
          )}


          {product.category === 'pot' && (() => {
            const p = product as any
            const potColorVal = p.pot_color ? (POT_COLOR_RU[p.pot_color.toLowerCase()] ?? p.pot_color) : null
            const matVal      = p.pot_material ? (POT_MATERIAL_RU[p.pot_material.toLowerCase()] ?? p.pot_material) : null
            const formVal     = p.pot_form ? (POT_FORM_RU[p.pot_form.toLowerCase()] ?? p.pot_form) : null
            const substrVal   = p.substrate ? (SUBSTRATE_RU[p.substrate.toLowerCase()] ?? p.substrate) : null
            return (
              <>
                {p.quality_grade       && <Row label="Качество">{p.quality_grade}</Row>}
                {p.min_plants_per_pot  && <Row label="Растений/горшок">{p.min_plants_per_pot} шт</Row>}
                {p.min_flowers_per_pot && <Row label="Цветков/горшок">{p.min_flowers_per_pot} шт</Row>}
                {potColorVal           && <Row label="Цвет горшка">{potColorVal}</Row>}
                {matVal                && <Row label="Материал горшка">{matVal}</Row>}
                {formVal               && <Row label="Тип горшка">{formVal}</Row>}
                {substrVal             && <Row label="Субстрат">{substrVal}</Row>}
              </>
            )
          })()}

        </div>

        {/* Stepper + Cart — одна строка, над описанием */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Stepper qty={qty} available={available} packSize={packSize} onDec={handleDec} onInc={handleInc} />
            {inCart && isAuthed ? (
              <button
                onClick={onGoToCart}
                style={{
                  flex: 1, height: 36,
                  background: 'var(--accent)', color: '#fff',
                  border: 'none', borderRadius: 'var(--radius-btn)',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                В корзину → {cartTotal.toLocaleString('ru-RU')} ₸
              </button>
            ) : (
              <button
                onClick={handleAddToCart}
                disabled={available === 0}
                style={{
                  flex: 1, height: 36,
                  background: available === 0 ? 'var(--bg2)' : 'var(--accent)',
                  color: available === 0 ? 'var(--text-mid)' : '#fff',
                  border: 'none', borderRadius: 'var(--radius-btn)',
                  fontSize: 12, fontWeight: 600,
                  cursor: available === 0 ? 'default' : 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {available === 0 ? 'Нет в наличии' : '+ В корзину'}
              </button>
            )}
          </div>
          {!inCart && cartCount > 0 && isAuthed && (
            <button
              onClick={onGoToCart}
              style={{
                width: '100%', marginTop: 6, padding: '7px 0',
                background: 'none', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-btn)', fontSize: 12,
                cursor: 'pointer', color: 'var(--text-mid)', fontFamily: 'inherit',
              }}
            >
              🛒 Корзина ({cartCount}) · {cartSum.toLocaleString('ru-RU')} ₸ →
            </button>
          )}
        </div>

        {/* Short description */}
        {(product as any).short_description && (
          <div style={{
            marginBottom: 8,
            padding: '6px 10px',
            background: 'var(--bg2)',
            borderRadius: 'var(--radius-btn)',
            fontSize: 12, color: 'var(--text)', lineHeight: 1.5,
          }}>
            {(product as any).short_description}
          </div>
        )}

        {/* Description */}
        {product.description && (
          <div style={{
            marginBottom: 12,
            padding: '8px 10px',
            background: 'var(--bg2)',
            borderRadius: 'var(--radius-btn)',
            borderLeft: '2px solid var(--accent-mid)',
          }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-mid)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
              Характеристики
            </div>
            <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
              {product.description}
            </div>
          </div>
        )}
      </div>

      {showAuth && (
        <AuthModal onClose={() => setShowAuth(false)} onSuccess={() => setShowAuth(false)} />
      )}

      {/* Лайтбокс — увеличенный просмотр фото по клику */}
      {lbOpen && mainPhoto && (
        <div onClick={() => setLbOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <button onClick={() => setLbOpen(false)}
            style={{ position: 'absolute', top: 16, right: 16, width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: 22, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
          {images.length > 1 && (
            <>
              <button onClick={e => { e.stopPropagation(); setPhotoIdx(i => (i - 1 + images.length) % images.length) }}
                style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: 22, cursor: 'pointer' }}>‹</button>
              <button onClick={e => { e.stopPropagation(); setPhotoIdx(i => (i + 1) % images.length) }}
                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: 22, cursor: 'pointer' }}>›</button>
            </>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mainPhoto} alt={displayName} onClick={e => e.stopPropagation()}
            style={{ maxWidth: '94vw', maxHeight: '92vh', objectFit: 'contain', borderRadius: 8, boxShadow: '0 8px 40px rgba(0,0,0,0.6)' }} />
        </div>
      )}
    </div>
  )
}

// ── State C: cart ────────────────────────────────────────────────────────────

function StateCart({ onBack }: { onBack: () => void }) {
  const router = useRouter()
  const { product, setProduct } = useDetailStore()
  const { items, remove, update, clear, total } = useCart()
  const { products } = useProductsStore()
  const [hoveredId, setHoveredId] = useState<number | null>(null)

  function openProduct(id: number) {
    const p = products.find(x => x.id === id)
    if (p) setProduct(p)
  }

  const count = items.reduce((s, i) => s + i.qty, 0)

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
        <span style={{ fontFamily: 'var(--font-serif)', fontSize: 15, fontWeight: 600, marginLeft: product ? 4 : 0 }}>
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
              <SwipeToDelete key={item.id} onDelete={() => remove(item.id)}>
              <div style={{
                background: 'var(--bg2)', borderRadius: 'var(--radius-card)', padding: '8px 10px',
              }}>
                {/* Row: thumbnail + name/price + total */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  {item.image_url ? (
                    <Image src={item.image_url} alt="" width={36} height={36} sizes="36px" style={{ objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
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
                      {item.price.toLocaleString('ru-RU')} ₸/{unitForProduct(item)}
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
              </SwipeToDelete>
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
          <button
            onClick={() => router.push('/checkout')}
            style={{
              width: '100%', padding: '11px 14px',
              background: 'var(--accent)', color: '#fff', border: 'none',
              borderRadius: 'var(--radius-btn)', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit', marginBottom: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            Оформить заказ
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
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
    </div>
  )
}

// ── main component ───────────────────────────────────────────────────────────

export default function DetailPanel() {
  const { panel, product, setPanel } = useDetailStore()

  if (panel === 'cart') return <StateCart onBack={() => setPanel('detail')} />
  if (panel === 'detail' && product) return <StateDetail product={product} onGoToCart={() => setPanel('cart')} onClose={() => setPanel('empty')} />
  return <StateEmpty />
}

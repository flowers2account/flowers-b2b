'use client'
import { useRouter } from 'next/navigation'
import { useCart } from '@/lib/cart-store'

// Единый стандарт карточки товара для AI-виджета (хэндофф «★ Стандарт карточки»).
// Контракт данных — независим от источника.
export interface CardProduct {
  id: number
  sku: string | null      // артикул 1С; нет → строка артикула скрыта
  name: string
  image: string | null
  price: number | null
  unit: string | null
  stock: number
  pack: number | null
  url: string             // /product/{id}
}
export type CardDensity = 'full' | 'mini' | 'compact'

// ── токены (строго из хэндоффа) ──
const PLAYFAIR = "var(--font-playfair), 'Playfair Display', 'Lora', Georgia, serif"
const MONO = "var(--font-jetbrains), 'JetBrains Mono', monospace"
const GOLOS = "var(--font-golos), system-ui, sans-serif"
const FERN = '#3D6B50'
const FERN_SOFT = '#E8F0EA'
const fmtPrice = (n: number | null) => (n != null ? `${Number(n).toLocaleString('ru-RU')} ₸` : '—')

// Бейдж наличия (точно по хэндоффу).
function stockBadge(stock: number) {
  if (stock >= 6) return { label: `${stock} шт в наличии`, color: '#fff', bg: FERN, border: FERN }
  if (stock >= 1) return { label: `осталось ${stock}`, color: '#9A5A1E', bg: '#FBF0E3', border: '#EBD6BC' }
  return { label: 'под заказ', color: '#6B7570', bg: '#F2F2F0', border: '#E5E5E3' }
}

function Placeholder() {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(150deg,#F1ECE8,#E6DED7)', color: '#A8A4AD' }}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.5-3.5L9 20" /></svg>
    </div>
  )
}

const CARD_SHADOW = '0 1px 2px rgba(40,20,30,.05), 0 4px 14px rgba(40,20,30,.06)'

export default function ProductCard({ p, density, onAdded }: {
  p: CardProduct
  density: CardDensity
  onAdded?: () => void
}) {
  const router = useRouter()
  const { items, add, update } = useCart()
  const inCart = items.some((i) => i.id === p.id)   // ключ строки id+color; для карточки достаточно по id
  const badge = stockBadge(p.stock)

  const addToCart = () => {
    add({ id: p.id, name: p.name, price: p.price ?? 0, available: p.stock, category: 'accessories', image_url: p.image, unit: p.unit, subcategory: null, color: null })
    update(p.id, p.pack && p.pack > 1 ? p.pack : 1, null) // шаг = кратность
    onAdded?.()
  }

  const Badge = ({ overlay }: { overlay?: boolean }) => (
    <span style={{
      fontSize: 9.5, fontWeight: 700, fontFamily: MONO, padding: '2px 7px', borderRadius: 999,
      color: badge.color, background: badge.bg, border: `1px solid ${badge.border}`, whiteSpace: 'nowrap',
      ...(overlay ? { position: 'absolute', top: 6, left: 6, boxShadow: '0 1px 3px rgba(0,0,0,.18)' } : {}),
    }}>{badge.label}</span>
  )
  const PackPill = () => (p.pack && p.pack > 1 ? (
    <span style={{ fontSize: 9.5, fontWeight: 600, fontFamily: MONO, padding: '2px 7px', borderRadius: 999, color: 'var(--text-mid)', background: 'var(--bg2)', border: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
      уп. {p.pack}{p.unit ? ` ${p.unit}` : ''}
    </span>
  ) : null)

  const addBtn = (full: boolean) => (
    <button onClick={addToCart}
      style={{
        flex: 1, height: 32, border: 'none', borderRadius: 10, cursor: 'pointer', fontFamily: GOLOS, fontSize: 12, fontWeight: 600,
        background: inCart ? FERN_SOFT : 'var(--accent)', color: inCart ? FERN : '#fff',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
      }}>
      {inCart ? 'В корзине ✓' : (full ? 'В корзину' : '+ В корзину')}
    </button>
  )
  const openBtn = (
    <button onClick={() => router.push(p.url)} title="Открыть товар" aria-label="Открыть товар"
      style={{ width: 36, height: 32, border: '1px solid var(--border)', borderRadius: 10, cursor: 'pointer', background: 'var(--bg)', color: 'var(--accent)', fontSize: 14, flexShrink: 0 }}>↗</button>
  )

  // ── FULL (~300px) — лента чата: фото 74×74 слева ──
  if (density === 'full') {
    return (
      <div style={{ display: 'flex', gap: 11, padding: 10, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 15, boxShadow: CARD_SHADOW, width: '100%' }}>
        <div style={{ width: 74, height: 74, borderRadius: 12, overflow: 'hidden', flexShrink: 0, background: 'var(--bg2)' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {p.image ? <img src={p.image} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Placeholder />}
        </div>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {p.sku && <div style={{ fontFamily: MONO, fontSize: 9.5, color: 'var(--text-mid)', letterSpacing: '.02em' }}>{p.sku}</div>}
          <div style={{ fontFamily: GOLOS, fontSize: 13, fontWeight: 600, lineHeight: 1.25, color: 'var(--text)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.name}</div>
          <div style={{ fontFamily: PLAYFAIR, fontSize: 18, fontWeight: 700, color: 'var(--accent)' }}>
            {fmtPrice(p.price)}{p.unit ? <span style={{ fontFamily: GOLOS, fontSize: 11, fontWeight: 500, color: 'var(--text-mid)' }}> / {p.unit}</span> : null}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><Badge /><PackPill /></div>
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>{addBtn(true)}{openBtn}</div>
        </div>
      </div>
    )
  }

  // ── MINI (~158px) — карусель: фото сверху + overlay-бейдж ──
  if (density === 'mini') {
    return (
      <div style={{ width: 158, flexShrink: 0, scrollSnapAlign: 'start', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: CARD_SHADOW, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ position: 'relative', aspectRatio: '1/1', background: 'var(--bg2)' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {p.image ? <img src={p.image} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Placeholder />}
          <Badge overlay />
        </div>
        <div style={{ padding: '8px 9px', display: 'flex', flexDirection: 'column', gap: 5, flex: 1 }}>
          <div style={{ fontFamily: GOLOS, fontSize: 12, fontWeight: 600, lineHeight: 1.22, color: 'var(--text)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: 44 }}>{p.name}</div>
          <div style={{ fontFamily: PLAYFAIR, fontSize: 14.5, fontWeight: 700, color: 'var(--accent)' }}>{fmtPrice(p.price)}</div>
          <div style={{ marginTop: 'auto' }}>{addBtn(false)}</div>
        </div>
      </div>
    )
  }

  // ── COMPACT (~172px) — вертикальная для каталога/мобайла (одна кнопка) ──
  return (
    <div style={{ width: 172, flexShrink: 0, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: CARD_SHADOW, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ aspectRatio: '1/1', background: 'var(--bg2)' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {p.image ? <img src={p.image} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Placeholder />}
      </div>
      <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 5, flex: 1 }}>
        {p.sku && <div style={{ fontFamily: MONO, fontSize: 9.5, color: 'var(--text-mid)' }}>{p.sku}</div>}
        <div style={{ fontFamily: GOLOS, fontSize: 12.5, fontWeight: 600, lineHeight: 1.22, color: 'var(--text)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: 30 }}>{p.name}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: PLAYFAIR, fontSize: 16, fontWeight: 700, color: 'var(--accent)' }}>{fmtPrice(p.price)}</span>
          <Badge />
        </div>
        <div style={{ marginTop: 'auto' }}>{addBtn(false)}</div>
      </div>
    </div>
  )
}

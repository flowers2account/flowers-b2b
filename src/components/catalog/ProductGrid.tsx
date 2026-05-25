'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { useCart } from '@/lib/cart-store'
import { useAuthStore } from '@/lib/auth-store'
import { useFilters } from '@/lib/filter-store'
import { useDetailStore } from '@/lib/detail-store'
import { useProductsStore } from '@/lib/products-store'
import { useIsMobile } from '@/lib/use-mobile'
import { useFilterChips } from '@/lib/filter-chips'
import { createClient } from '@/lib/supabase/client'
import AuthModal from './AuthModal'
import { type Product, getAvailable, getPrice } from './ProductCard'
import { COLORS } from '@/lib/colors'

const ROLE_ICONS: Record<string, string> = {
  focal: '🌹', mass: '🌸', line: '🌿',
  filler: '🍃', texture: '✨', foliage: '🌱',
}
const ROLE_LABELS: Record<string, string> = {
  focal: 'Фокусный', mass: 'Массовый', line: 'Линейный',
  filler: 'Наполнитель', texture: 'Текстура', foliage: 'Зелень',
}
const ORIGIN_LABELS: Record<string, string> = {
  ecuador: 'Эквадор', kenya: 'Кения', holland: 'Голландия',
  china: 'Китай', colombia: 'Колумбия', local: 'Местный',
}

type SortKey = 'popular' | 'price_asc' | 'price_desc' | 'stock'

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'popular', label: 'По популярности' },
  { value: 'price_asc', label: 'Цена ↑' },
  { value: 'price_desc', label: 'Цена ↓' },
  { value: 'stock', label: 'По наличию' },
]

// ── card tag badge ──────────────────────────────────────────────────────────

function TagBadge({ type }: { type: 'hit' | 'sale' | 'new' }) {
  const styles: Record<string, React.CSSProperties> = {
    hit: { background: '#FFB300', color: '#1a1a1a' },
    sale: { background: '#E53935', color: '#fff' },
    new: { background: 'var(--fern)', color: '#fff' },
  }
  const labels = { hit: 'Хит', sale: 'Акция', new: 'Нов.' }
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: '0.04em',
      padding: '3px 7px', borderRadius: 'var(--radius-btn)',
      textTransform: 'uppercase', ...styles[type],
    }}>
      {labels[type]}
    </span>
  )
}

// ── qty badge on photo ──────────────────────────────────────────────────────

function QtyBadge({ qty }: { qty: number }) {
  const isLow = qty > 0 && qty <= 30
  return (
    <span style={{
      position: 'absolute', bottom: 8, left: 8,
      background: qty === 0 ? 'rgba(200,50,50,0.85)' : isLow ? 'rgba(217,83,79,0.85)' : 'rgba(0,0,0,0.55)',
      color: '#fff', fontSize: 10, fontWeight: 700,
      padding: '3px 7px', borderRadius: 'var(--radius-btn)',
      backdropFilter: 'blur(4px)',
    }}>
      {qty === 0 ? 'Нет' : `${qty} шт`}
    </span>
  )
}

// ── stepper ─────────────────────────────────────────────────────────────────

function Stepper({
  qty, available, packSize, onDec, onInc,
}: {
  qty: number; available: number; packSize: number
  onDec: () => void; onInc: () => void
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      border: '1px solid var(--border)', borderRadius: 'var(--radius-btn)',
      overflow: 'hidden', marginTop: 8,
    }}>
      <button
        onClick={onDec}
        disabled={qty === 0}
        style={{
          width: 28, height: 28, border: 'none',
          background: 'var(--bg2)', color: 'var(--accent)',
          fontSize: 14, fontWeight: 700, cursor: qty === 0 ? 'default' : 'pointer',
          opacity: qty === 0 ? 0.35 : 1,
        }}
      >−</button>
      <span style={{
        flex: 1, textAlign: 'center', fontSize: 12, fontWeight: 700,
        padding: '6px 0',
        borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)',
      }}>
        {qty}
      </span>
      <button
        onClick={onInc}
        disabled={qty >= available}
        style={{
          width: 28, height: 28, border: 'none',
          background: 'var(--bg2)', color: 'var(--accent)',
          fontSize: 14, fontWeight: 700, cursor: qty >= available ? 'default' : 'pointer',
          opacity: qty >= available ? 0.35 : 1,
        }}
      >+</button>
    </div>
  )
}

// ── grid card ───────────────────────────────────────────────────────────────

function GridCard({
  product, qty, isAuthed,
  onDec, onInc, onCardClick,
}: {
  product: Product; qty: number; isAuthed: boolean
  onDec: () => void; onInc: () => void; onCardClick: () => void
}) {
  const available = getAvailable(product.stock)
  const price = getPrice(product.stock)
  const hasDiscount = !!(product.previous_price && product.previous_price > price)
  const displayName = product.display_name || product.variety_name || product.name
  type Dim = { type: 'length' | 'diam'; val: string }
  const dims: Dim[] = product.category === 'pot'
    ? [
        product.length_cm ? { type: 'length', val: `${product.length_cm}см` } : null,
        product.pot_diameter ? { type: 'diam', val: `${product.pot_diameter}` } : null,
      ].filter(Boolean) as Dim[]
    : (product.length_cm || product.length_str
        ? [{ type: 'length', val: product.length_cm ? `${product.length_cm}см` : product.length_str! }]
        : [])
  const [hovered, setHovered] = useState(false)
  const [activePhoto, setActivePhoto] = useState(0)
  const hasSecondPhoto = !!product.campaign_image_url
  const showSecond = hasSecondPhoto && (hovered || activePhoto === 1)

  return (
    <div
      onClick={onCardClick}
      style={{
        background: '#fff', border: `1px solid ${qty > 0 ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-card)',
        boxShadow: qty > 0 ? '0 0 0 2px var(--accent-light)' : 'none',
        overflow: 'hidden', display: 'flex', flexDirection: 'column',
        cursor: 'pointer',
      }}
    >
      {/* Фото */}
      <div
        style={{ aspectRatio: '1/1', position: 'relative', background: 'var(--accent-light)', overflow: 'hidden' }}
        onMouseEnter={() => hasSecondPhoto && setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={displayName}
            style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
              opacity: showSecond ? 0 : 1,
              transition: 'opacity 0.3s ease',
            }}
          />
        ) : (
          <div style={{
            width: '100%', height: '100%', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 38, opacity: 0.4,
            background: 'repeating-linear-gradient(-45deg,transparent 0 8px,rgba(139,58,90,0.04) 8px 16px)',
          }}>
            🌸
          </div>
        )}
        {hasSecondPhoto && (
          <img
            src={product.campaign_image_url!}
            alt={displayName}
            style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
              opacity: showSecond ? 1 : 0,
              transition: 'opacity 0.3s ease',
            }}
          />
        )}
        {/* Точки-переключатели — только если есть 2 фото */}
        {hasSecondPhoto && (
          <div
            style={{ position: 'absolute', bottom: 6, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 4, zIndex: 3 }}
            onClick={e => e.stopPropagation()}
          >
            {[0, 1].map(i => (
              <div
                key={i}
                onClick={() => setActivePhoto(i)}
                style={{
                  width: 5, height: 5, borderRadius: '50%', cursor: 'pointer',
                  background: i === activePhoto ? '#fff' : 'rgba(255,255,255,0.45)',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.35)',
                  transition: 'background 0.2s',
                }}
              />
            ))}
          </div>
        )}
        <QtyBadge qty={available} />
        {/* Теги */}
        <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
          {hasDiscount && <TagBadge type="sale" />}
          {product.is_new && <TagBadge type="new" />}
        </div>
      </div>

      {/* Тело */}
      <div style={{ padding: '10px 12px 12px', display: 'flex', flexDirection: 'column', flex: 1, gap: 2 }}>
        <div style={{
          fontFamily: 'var(--font-playfair)', fontSize: 14, fontWeight: 400,
          lineHeight: 1.25, color: 'var(--text)',
        }}>
          {displayName}
        </div>

        {/* Кружки цветов — colors[] или fallback на color */}
        {(() => {
          const keys = product.colors?.length ? product.colors : product.color ? [product.color] : []
          if (!keys.length) return null
          return (
            <div style={{ display: 'flex', gap: 3, marginTop: 3, flexWrap: 'wrap' }}>
              {keys.map(c => {
                const col = COLORS.find(x => x.key === c)
                return (
                  <div key={c} title={col?.label ?? c} style={{
                    width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                    background: col
                      ? (('gradient' in col ? col.gradient : col.bg) as string)
                      : '#ccc',
                    border: '1px solid rgba(0,0,0,0.1)',
                  }} />
                )
              })}
            </div>
          )
        })()}

        {/* Происхождение */}
        {product.origin && (
          <div style={{ fontSize: 10, color: 'var(--text-mid)', marginTop: 2 }}>
            {ORIGIN_LABELS[product.origin] ?? product.origin}
          </div>
        )}

        {dims.length > 0 && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', marginTop: 2, flexWrap: 'wrap' }}>
            {dims.map((d, i) => (
              <span key={i} style={{ fontSize: 11, color: 'var(--text-mid)', display: 'inline-flex', alignItems: 'baseline', gap: 2 }}>
                {d.type === 'length'
                  ? <><span style={{ fontSize: 13 }}>↕</span>{d.val}</>
                  : <><span style={{ fontSize: 18, lineHeight: 1 }}>⌀</span>{d.val}</>}
              </span>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 'auto', paddingTop: 6 }}>
          {isAuthed ? (
            <>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent)' }}>
                {price.toLocaleString('ru-RU')} ₸
              </span>
              {hasDiscount && (
                <span style={{ fontSize: 10, color: 'var(--text-mid)', textDecoration: 'line-through' }}>
                  {product.previous_price!.toLocaleString('ru-RU')} ₸
                </span>
              )}
            </>
          ) : (
            <span style={{ fontSize: 13, color: '#ccc', letterSpacing: '0.1em', userSelect: 'none' }}>●●● ₸</span>
          )}
          <span style={{ fontSize: 10, color: 'var(--text-mid)' }}>уп.&nbsp;{product.pack_size} шт</span>
          {product.stems_per_pack && product.stems_per_pack > 0 && (
            <span style={{ fontSize: 10, color: 'var(--text-mid)' }}>{product.stems_per_pack} стебл.</span>
          )}
        </div>

        {/* stop propagation so stepper click doesn't open detail */}
        <div onClick={e => e.stopPropagation()}>
          <Stepper qty={qty} available={available} packSize={product.pack_size || 5} onDec={onDec} onInc={onInc} />
        </div>
      </div>
    </div>
  )
}

// ── list row ─────────────────────────────────────────────────────────────────

function ListRow({
  product, qty, isAuthed, onDec, onInc, onCardClick,
}: {
  product: Product; qty: number; isAuthed: boolean
  onDec: () => void; onInc: () => void; onCardClick: () => void
}) {
  const available = getAvailable(product.stock)
  const price = getPrice(product.stock)
  const hasDiscount = !!(product.previous_price && product.previous_price > price)
  const displayName = product.display_name || product.variety_name || product.name
  type Dim = { type: 'length' | 'diam'; val: string }
  const dims: Dim[] = product.category === 'pot'
    ? [
        product.length_cm ? { type: 'length', val: `${product.length_cm}см` } : null,
        product.pot_diameter ? { type: 'diam', val: `${product.pot_diameter}` } : null,
      ].filter(Boolean) as Dim[]
    : (product.length_cm || product.length_str
        ? [{ type: 'length', val: product.length_cm ? `${product.length_cm}см` : product.length_str! }]
        : [])

  return (
    <div
      onClick={onCardClick}
      style={{
        background: '#fff', border: `1px solid ${qty > 0 ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-card)',
        display: 'grid', gridTemplateColumns: '56px 1fr auto',
        alignItems: 'center', gap: 12, padding: '8px 14px 8px 8px',
        boxShadow: qty > 0 ? '0 0 0 2px var(--accent-light)' : 'none',
        cursor: 'pointer',
      }}
    >
      {/* Миниатюра */}
      <div style={{ width: 56, height: 56, borderRadius: 'var(--radius-card)', background: 'var(--accent-light)', overflow: 'hidden', flexShrink: 0, position: 'relative' }}>
        {product.image_url
          ? <img src={product.image_url} alt={displayName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, opacity: 0.5 }}>🌸</div>
        }
      </div>

      {/* Инфо */}
      <div>
        <div style={{ fontFamily: 'var(--font-playfair)', fontSize: 13, fontWeight: 400, lineHeight: 1.25, color: 'var(--text)' }}>
          {displayName}
        </div>
        {dims.length > 0 && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', marginTop: 2 }}>
            {dims.map((d, i) => (
              <span key={i} style={{ fontSize: 11, color: 'var(--text-mid)', display: 'inline-flex', alignItems: 'baseline', gap: 2 }}>
                {d.type === 'length'
                  ? <><span style={{ fontSize: 13 }}>↕</span>{d.val}</>
                  : <><span style={{ fontSize: 18, lineHeight: 1 }}>⌀</span>{d.val}</>}
              </span>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
          <span style={{ fontSize: 10, color: 'var(--text-mid)' }}>
            {available === 0 ? 'Нет в наличии' : `${available} шт`}
          </span>
          {hasDiscount && <TagBadge type="sale" />}
        </div>
      </div>

      {/* Цена + степпер */}
      <div
        onClick={e => e.stopPropagation()}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}
      >
        {isAuthed ? (
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}>
            {price.toLocaleString('ru-RU')} ₸
          </span>
        ) : (
          <span style={{ fontSize: 12, color: '#ccc', userSelect: 'none' }}>●●● ₸</span>
        )}
        <Stepper qty={qty} available={available} packSize={product.pack_size || 5} onDec={onDec} onInc={onInc} />
      </div>
    </div>
  )
}

// ── View toggle icons ────────────────────────────────────────────────────────

// 3-col grid
const GridIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="2" width="6" height="6"/><rect x="9" y="2" width="6" height="6"/><rect x="16" y="2" width="6" height="6"/>
    <rect x="2" y="10" width="6" height="6"/><rect x="9" y="10" width="6" height="6"/><rect x="16" y="10" width="6" height="6"/>
    <rect x="2" y="18" width="6" height="6"/><rect x="9" y="18" width="6" height="6"/><rect x="16" y="18" width="6" height="6"/>
  </svg>
)
// 4-col compact
const CompactIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="2" width="4" height="4"/><rect x="8" y="2" width="4" height="4"/><rect x="14" y="2" width="4" height="4"/><rect x="20" y="2" width="4" height="4"/>
    <rect x="2" y="9" width="4" height="4"/><rect x="8" y="9" width="4" height="4"/><rect x="14" y="9" width="4" height="4"/><rect x="20" y="9" width="4" height="4"/>
    <rect x="2" y="16" width="4" height="4"/><rect x="8" y="16" width="4" height="4"/><rect x="14" y="16" width="4" height="4"/><rect x="20" y="16" width="4" height="4"/>
  </svg>
)
const ListIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
  </svg>
)

// ── search helpers ───────────────────────────────────────────────────────────

const RU_TO_EN: Record<string, string> = {
  а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'yo',ж:'zh',з:'z',и:'i',й:'j',
  к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',
  х:'h',ц:'ts',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya',
}
const EN_TO_RU: Record<string, string> = {
  a:'а',b:'б',v:'в',g:'г',d:'д',e:'е',z:'з',i:'и',j:'й',k:'к',l:'л',
  m:'м',n:'н',o:'о',p:'п',r:'р',s:'с',t:'т',u:'у',f:'ф',h:'х',y:'й',c:'к',
}

function translitRuToEn(s: string): string {
  return s.split('').map(c => RU_TO_EN[c] ?? c).join('')
}
function translitEnToRu(s: string): string {
  return s.split('').map(c => EN_TO_RU[c] ?? c).join('')
}

function matchesSearch(p: Product, query: string): boolean {
  const q = query.toLowerCase().trim()
  if (!q) return true
  const haystack = [
    p.variety_name?.toLowerCase(),
    p.name.toLowerCase(),
    ...((p as Product & { search_aliases?: string[] }).search_aliases?.map(a => a.toLowerCase()) ?? []),
  ].filter(Boolean).join(' ')
  if (haystack.includes(q)) return true
  const qTranslit = translitRuToEn(q)
  if (qTranslit !== q && haystack.includes(qTranslit)) return true
  const qRu = translitEnToRu(q)
  if (qRu !== q && haystack.includes(qRu)) return true
  return false
}

// ── main component ───────────────────────────────────────────────────────────

export default function ProductGrid({ products: initialProducts }: { products: Product[] }) {
  const [products, setProducts] = useState(initialProducts)
  const [showAuth, setShowAuth] = useState(false)
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null)
  const [sort, setSort] = useState<SortKey>('popular')
  const [viewMode, setViewMode] = useState<'compact' | 'list'>('compact')

  const { items, add, update } = useCart()
  const { isAuthed } = useAuthStore()
  const { setProduct, flashCart } = useDetailStore()
  const { setProducts: syncProducts, setFilteredCount } = useProductsStore()
  const isMobile = useIsMobile()
  const {
    category, subcat, varietyType, colors, onlyDiscount, stockLevel, search,
    lengths, origins, potSizes, tags, seasons,
    setSearch, reset,
  } = useFilters()

  // Sync products to global store so DetailPanel can look up by id
  useEffect(() => { syncProducts(products) }, [products])

  // Persist view mode
  useEffect(() => {
    const saved = localStorage.getItem('catalog-view')
    if (saved === 'list' || saved === 'compact') setViewMode(saved)
  }, [])
  const setView = (v: 'compact' | 'list') => {
    setViewMode(v)
    localStorage.setItem('catalog-view', v)
  }

  // Real-time stock updates
  useEffect(() => {
    const supabase = createClient()
    const ch = supabase.channel('stock-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock' }, async () => {
        const res = await fetch('/api/products')
        const data = await res.json()
        if (data) setProducts(data)
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  const requireAuth = useCallback((action: () => void) => {
    if (isAuthed) action()
    else { setPendingAction(() => action); setShowAuth(true) }
  }, [isAuthed])

  const getQty = (id: number) => items.find(i => i.id === id)?.qty ?? 0

  const chips = useFilterChips()

  // Filter
  const filtered = useMemo(() => {
    let list = products.filter(p => {
      const available = getAvailable(p.stock)
      const price = getPrice(p.stock)
      const hasDiscount = !!(p.previous_price && p.previous_price > price)

      if (category !== 'all' && p.category !== category) return false
      if (subcat && (p.subcategory || '') !== subcat) return false
      if (varietyType && (p.variety_type || '') !== varietyType) return false
      if (colors.length > 0 && !colors.some(c => p.colors?.includes(c) || p.color === c)) return false
      if (available <= 0) return false
      if (stockLevel === 'low'  && available >= 50) return false
      if (stockLevel === 'high' && available < 50)  return false
      if (onlyDiscount && !hasDiscount) return false
      if (search && !matchesSearch(p, search)) return false
      // Длина стебля (cut)
      if (lengths.length > 0) {
        const cm = p.length_cm ?? 0
        if (!lengths.includes(cm)) return false
      }
      if (origins.length > 0) {
        const src = (p as any).country_iso ?? ''
        if (!src || !origins.includes(src)) return false
      }
      // Размер горшка (pot)
      if (potSizes.length > 0) {
        const ps = (p as any).pot_diameter ?? p.pot_size
        const ok = potSizes.some(id => {
          if (id === 'до12')  return ps <= 12
          if (id === '14-17') return ps >= 14 && ps <= 17
          if (id === '19-23') return ps >= 19 && ps <= 23
          if (id === '25+')   return ps >= 25
          return false
        })
        if (!ok) return false
      }
      // Теги
      if (tags.length > 0) {
        const hasHit  = (p as any).is_hit === true
        const hasSale = hasDiscount
        const hasNew  = (p as any).is_new === true
        const ptags = [...(hasHit ? ['hit'] : []), ...(hasSale ? ['sale'] : []), ...(hasNew ? ['new'] : [])]
        if (!tags.some(t => ptags.includes(t))) return false
      }
      // Сезон (поле может содержать несколько значений через запятую)
      if (seasons.length > 0) {
        const pSeasons = Array.isArray(p.season)
          ? p.season as string[]
          : (p.season || '').split(',').map((s: string) => s.trim()).filter(Boolean)
        if (!seasons.some(s => pSeasons.includes(s))) return false
      }
      return true
    })

    // Sort
    if (sort === 'price_asc') list = [...list].sort((a, b) => getPrice(a.stock) - getPrice(b.stock))
    else if (sort === 'price_desc') list = [...list].sort((a, b) => getPrice(b.stock) - getPrice(a.stock))
    else if (sort === 'stock') list = [...list].sort((a, b) => getAvailable(b.stock) - getAvailable(a.stock))
    else {
      // Default: новинки первыми, затем по умолчанию
      list = [...list].sort((a, b) => {
        if (a.is_new && !b.is_new) return -1
        if (!a.is_new && b.is_new) return 1
        return 0
      })
    }

    return list
  }, [products, category, subcat, varietyType, colors, onlyDiscount, stockLevel, search, lengths, origins, potSizes, tags, seasons, sort])

  // Sync filtered count for mobile "Show N results" button
  useEffect(() => { setFilteredCount(filtered.length) }, [filtered.length])

  const handleDec = (product: Product, qty: number) => requireAuth(() =>
    update(product.id, Math.max(0, qty - (product.pack_size || 5)))
  )
  const handleInc = (product: Product, qty: number, available: number, price: number) =>
    requireAuth(() => {
      const packSize = product.pack_size || 5
      if (qty === 0) {
        add({ id: product.id, name: (product.display_name || product.variety_name || product.name) + (product.length_str ? ' ' + product.length_str : ''), price, available, category: product.category, image_url: product.image_url })
        update(product.id, packSize)
      } else {
        update(product.id, Math.min(qty + packSize, available))
      }
      flashCart(product)
    })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <div style={{ background: '#fff', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {/* Row 1: search — full width, prominent */}
        <div style={{ padding: '10px 16px 6px', position: 'relative' }}>
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="var(--text-mid)" strokeWidth="2" strokeLinecap="round"
            style={{ position: 'absolute', left: 28, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
          >
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            type="text"
            placeholder="Поиск по сорту, цвету, ферме..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus={!isMobile}
            style={{
              width: '100%', padding: '8px 36px 8px 34px',
              border: `1.5px solid ${search ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-input)', fontSize: 13,
              fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
              color: 'var(--text)', background: '#fff',
              transition: 'border-color 0.15s',
            }}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              style={{
                position: 'absolute', right: 28, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-mid)', fontSize: 16, lineHeight: 1, padding: 2,
              }}
            >×</button>
          )}
        </div>

        {/* Row 2: sort + view toggle + count */}
        <div style={{ padding: '0 16px 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <select
            value={sort}
            onChange={e => setSort(e.target.value as SortKey)}
            style={{
              padding: '6px 28px 6px 10px', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-input)', fontSize: 12,
              background: '#fff', fontFamily: 'inherit', color: 'var(--text)',
              backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236B7570' stroke-width='2.5' stroke-linecap='round'><path d='M6 9l6 6 6-6'/></svg>\")",
              backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center', appearance: 'none',
              cursor: 'pointer', flexShrink: 0,
            }}
          >
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

          <div style={{
            display: 'flex', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-btn)', overflow: 'hidden',
          }}>
            {(['compact', 'list'] as const).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                title={v === 'compact' ? 'Сетка' : 'Список'}
                style={{
                  width: 30, height: 30, border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: viewMode === v ? 'var(--accent)' : '#fff',
                  color: viewMode === v ? '#fff' : '#b8b0b4',
                }}
              >
                {v === 'compact' ? <CompactIcon /> : <ListIcon />}
              </button>
            ))}
          </div>

          <span style={{ fontSize: 11, color: search ? 'var(--accent)' : 'var(--text-mid)', whiteSpace: 'nowrap', fontWeight: search ? 600 : 400 }}>
            {filtered.length} позиций
          </span>
        </div>
      </div>

      {/* Active filter chips */}
      {chips.length > 0 && (
        <div style={{
          background: '#fff', borderBottom: '1px solid var(--border)',
          padding: '8px 16px', display: 'flex', gap: 6, flexWrap: 'wrap',
          alignItems: 'center', flexShrink: 0,
        }}>
          {chips.map((chip, i) => (
            <button
              key={i}
              onClick={chip.onRemove}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '3px 10px', borderRadius: 14,
                fontSize: 11, fontWeight: 500, fontFamily: 'inherit',
                background: 'var(--accent-light)', color: 'var(--accent)',
                border: '1px solid var(--accent)', cursor: 'pointer',
              }}
            >
              {chip.label} ×
            </button>
          ))}
          <button
            onClick={reset}
            style={{
              marginLeft: 'auto', padding: '3px 10px',
              fontSize: 11, fontWeight: 500, fontFamily: 'inherit',
              background: 'none', border: '1px dashed var(--border)',
              borderRadius: 14, color: 'var(--text-mid)', cursor: 'pointer',
            }}
          >
            Сбросить всё
          </button>
        </div>
      )}

      {/* Products */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', paddingBottom: isMobile ? 80 : 14 }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-mid)', paddingTop: 64, fontSize: 13 }}>
            Ничего не найдено
          </div>
        ) : viewMode !== 'list' ? (
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
            gap: 12,
          }}>
            {filtered.map(p => {
              const qty = getQty(p.id)
              const available = getAvailable(p.stock)
              const price = getPrice(p.stock)
              return (
                <GridCard
                  key={p.id}
                  product={p}
                  qty={qty}
                  isAuthed={isAuthed}
                  onDec={() => handleDec(p, qty)}
                  onInc={() => handleInc(p, qty, available, price)}
                  onCardClick={() => setProduct(p)}
                />
              )
            })}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(p => {
              const qty = getQty(p.id)
              const available = getAvailable(p.stock)
              const price = getPrice(p.stock)
              return (
                <ListRow
                  key={p.id}
                  product={p}
                  qty={qty}
                  isAuthed={isAuthed}
                  onDec={() => handleDec(p, qty)}
                  onInc={() => handleInc(p, qty, available, price)}
                  onCardClick={() => setProduct(p)}
                />
              )
            })}
          </div>
        )}
      </div>

      {showAuth && (
        <AuthModal
          onClose={() => { setShowAuth(false); setPendingAction(null) }}
          onSuccess={() => { pendingAction?.() }}
        />
      )}
    </div>
  )
}

'use client'

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
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
import { COUNTRY_LABELS, countryFlag } from '@/lib/countries'
import { unitForProduct, variantLabelForSubcat, subcatInLeaves, slugsForGroup } from '@/lib/category-tree'
import FavHeart from './FavHeart'

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
const ORIGIN_WORD_TO_ISO: Record<string, string> = {
  ecuador: 'EC', kenya: 'KE', holland: 'NL', china: 'CN',
  russia: 'RU', colombia: 'CO', ethiopia: 'ET', israel: 'IL',
  belgium: 'BE', denmark: 'DK', italy: 'IT', germany: 'DE',
  france: 'FR', turkey: 'TR',
}
function CountryBadge({ iso }: { iso: string }) {
  return (
    <span style={{
      fontSize: 10, color: '#5B7BA0', background: 'rgba(91,123,160,0.1)',
      borderRadius: 4, padding: '1px 6px', fontWeight: 500,
    }}>
      {countryFlag(iso)} {COUNTRY_LABELS[iso] ?? iso}
    </span>
  )
}

type SortKey = 'popular' | 'price_asc' | 'price_desc' | 'stock'

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'popular', label: 'По популярности' },
  { value: 'price_asc', label: 'Цена ↑' },
  { value: 'price_desc', label: 'Цена ↓' },
  { value: 'stock', label: 'По наличию' },
]

const VOLUME_RANGE_TEST: Record<string, (v: number) => boolean> = {
  'до5':   v => v <= 5,
  '5-15':  v => v > 5 && v <= 15,
  '15-40': v => v > 15 && v <= 40,
  '40+':   v => v > 40,
}

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

function QtyBadge({ qty, unit = 'шт' }: { qty: number; unit?: string }) {
  const isLow = qty > 0 && qty <= 30
  return (
    <span style={{
      position: 'absolute', bottom: 8, left: 8,
      background: qty === 0 ? 'rgba(200,50,50,0.85)' : isLow ? 'rgba(217,83,79,0.85)' : 'rgba(0,0,0,0.55)',
      color: '#fff', fontSize: 10, fontWeight: 700,
      padding: '3px 7px', borderRadius: 'var(--radius-btn)',
      backdropFilter: 'blur(4px)',
    }}>
      {qty === 0 ? 'Нет' : `${qty} ${unit}`}
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

export function GridCard({
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
  const [activePhoto, setActivePhoto] = useState(0)

  // Все фото: основное + кампанийное + extra_images
  const photos = [
    product.image_url,
    product.campaign_image_url,
    ...((product as any).extra_images as string[] ?? []),
  ].filter(Boolean) as string[]

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (photos.length < 2) return
    const { left, width } = e.currentTarget.getBoundingClientRect()
    const idx = Math.min(photos.length - 1, Math.floor(((e.clientX - left) / width) * photos.length))
    setActivePhoto(idx)
  }

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
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setActivePhoto(0)}
      >
        {photos.length > 0 ? (
          photos.map((url, idx) => (
            <Image
              key={url}
              fill
              src={url}
              alt={displayName}
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              style={{
                objectFit: 'cover',
                opacity: idx === activePhoto ? 1 : 0,
                transition: 'opacity 0.25s ease',
              }}
            />
          ))
        ) : (
          <div style={{
            width: '100%', height: '100%', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 38, opacity: 0.4,
            background: 'repeating-linear-gradient(-45deg,transparent 0 8px,rgba(139,58,90,0.04) 8px 16px)',
          }}>
            🌸
          </div>
        )}
        {/* Точки — по количеству фото */}
        {photos.length > 1 && (
          <div
            style={{ position: 'absolute', bottom: 6, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 4, zIndex: 3 }}
            onClick={e => e.stopPropagation()}
          >
            {photos.map((_, i) => (
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
        <QtyBadge qty={available} unit={unitForProduct(product as any)} />
        {/* Теги */}
        <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
          {hasDiscount && <TagBadge type="sale" />}
          {product.is_new && <TagBadge type="new" />}
        </div>
        {/* Избранное */}
        <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 4 }}>
          <FavHeart productId={product.id} size={30} />
        </div>
      </div>

      {/* Тело */}
      <div style={{ padding: '10px 12px 12px', display: 'flex', flexDirection: 'column', flex: 1, gap: 2 }}>
        <div style={{
          fontFamily: 'var(--font-golos)', fontSize: 14, fontWeight: 600,
          lineHeight: 1.25, color: 'var(--text)',
        }}>
          {displayName}
        </div>
        {displayName !== product.name && !/^\d+$/.test(product.name) && (
          <div style={{ fontSize: 10, color: 'var(--text-mid)', marginTop: 1, lineHeight: 1.2 }}>
            {product.name}
          </div>
        )}
        {(product as any).variant && (
          <div style={{ fontSize: 10, color: 'var(--text-mid)', lineHeight: 1.2 }}>
            <span style={{ opacity: 0.7 }}>{variantLabelForSubcat(product.subcategory)}:</span>{' '}
            {(product as any).variant}
          </div>
        )}
        {(product as any).short_description && (
          <div style={{ fontSize: 10, color: 'var(--text-mid)', lineHeight: 1.4, marginTop: 2 }}>
            {(product as any).short_description}
          </div>
        )}

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

        {/* Страна + ферма + вес */}
        {(product.country_iso || (product as any).farm || (product as any).weight_gram) && (
          <div style={{ marginTop: 2, display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
            {product.country_iso && <CountryBadge iso={product.country_iso} />}
            {(product as any).farm && (
              <span style={{ fontSize: 10, color: 'var(--text-mid)', fontStyle: 'italic' }}>
                {(product as any).farm}
              </span>
            )}
            {(product as any).weight_gram && (
              <span style={{ fontSize: 10, color: 'var(--text-mid)' }}>{(product as any).weight_gram} г</span>
            )}
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

        {(() => {
          const unit = unitForProduct(product as any)
          return (
            <div style={{ marginTop: 'auto', paddingTop: 6 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                {(isAuthed || product.category === 'accessories') ? (
                  <>
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent)' }}>
                      {price.toLocaleString('ru-RU')} ₸
                      {' '}<span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-mid)' }}>/ {unit}</span>
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
                {unit !== 'шт' && product.pack_size > 1 && (
                  <span style={{ fontSize: 10, color: 'var(--text-mid)' }}>уп.&nbsp;{product.pack_size}</span>
                )}
              </div>
              {/* price_per_m / price_per_m2 справочная строка */}
              {(isAuthed || product.category === 'accessories') && ((product as any).price_per_m || (product as any).price_per_m2) && (
                <div style={{ fontSize: 10, color: 'var(--text-mid)', marginTop: 2 }}>
                  {(product as any).price_per_m && `${Number((product as any).price_per_m).toLocaleString('ru-RU')} ₸/пог.м`}
                  {(product as any).price_per_m && (product as any).price_per_m2 && ' · '}
                  {(product as any).price_per_m2 && `${Number((product as any).price_per_m2).toLocaleString('ru-RU')} ₸/м²`}
                </div>
              )}
            </div>
          )
        })()}

        {/* stop propagation so stepper click doesn't open detail */}
        <div onClick={e => e.stopPropagation()}>
          <Stepper qty={qty} available={available} packSize={product.stems_per_pack || product.pack_size || 1} onDec={onDec} onInc={onInc} />
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
          ? <Image src={product.image_url} alt={displayName} width={56} height={56} sizes="56px" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, opacity: 0.5 }}>🌸</div>
        }
      </div>

      {/* Инфо */}
      <div>
        <div style={{ fontFamily: 'var(--font-golos)', fontSize: 13, fontWeight: 600, lineHeight: 1.25, color: 'var(--text)' }}>
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
            {available === 0 ? 'Нет в наличии' : `${available} ${unitForProduct(product as any)}`}
          </span>
          {product.country_iso && <CountryBadge iso={product.country_iso} />}
          {hasDiscount && <TagBadge type="sale" />}
        </div>
      </div>

      {/* Цена + степпер */}
      <div
        onClick={e => e.stopPropagation()}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}
      >
        {(isAuthed || product.category === 'accessories') ? (
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}>
            {price.toLocaleString('ru-RU')} ₸
          </span>
        ) : (
          <span style={{ fontSize: 12, color: '#ccc', userSelect: 'none' }}>●●● ₸</span>
        )}
        <Stepper qty={qty} available={available} packSize={product.stems_per_pack || product.pack_size || 1} onDec={onDec} onInc={onInc} />
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

// ── smart search suggestions ─────────────────────────────────────────────────

type SuggestionDef = { keywords: string[]; label: string; type: 'subcat' | 'tag' | 'color'; value: string }

const SMART_SUGGESTIONS: SuggestionDef[] = [
  // Tags
  { keywords: ['хит', 'популяр', 'бестселл'], label: '🔥 Хит продаж', type: 'tag', value: 'hit' },
  { keywords: ['акция', 'скидк', 'уценк', 'дешев'], label: '🏷 Акция', type: 'tag', value: 'sale' },
  { keywords: ['новинк', 'новый', 'новое', 'новые'], label: '🆕 Новинка', type: 'tag', value: 'new' },
  // Accessories — Упаковка флористическая
  { keywords: ['плёнк', 'пленк', 'стрет', 'флорист'], label: 'Плёнка', type: 'subcat', value: 'film' },
  { keywords: ['бумаг', 'крафт', 'тишью', 'органз', 'лент'], label: 'Бумага', type: 'subcat', value: 'paper' },
  { keywords: ['пакет', 'сетк', 'мешоч', 'упаков', 'упак'], label: 'Пакеты', type: 'subcat', value: 'film_bags' },
  // Accessories — Горшки, кашпо и фонтаны
  { keywords: ['горшок', 'горш', 'вазон'], label: 'Горшки', type: 'subcat', value: 'pots' },
  { keywords: ['кашпо', 'кашп'], label: 'Кашпо', type: 'subcat', value: 'kashpo' },
  { keywords: ['фонтан'], label: 'Фонтаны', type: 'subcat', value: 'fountains' },
  { keywords: ['ваза', 'вазы', 'ваз'], label: 'Вазы', type: 'subcat', value: 'vases' },
  { keywords: ['декор', 'сувен', 'фигурк'], label: 'Декор и сувениры', type: 'subcat', value: 'decor' },
  // Accessories — Грунт и удобрения
  { keywords: ['грунт', 'субстрат', 'торф', 'перлит', 'компост', 'дренаж', 'кокос'], label: 'Грунты', type: 'subcat', value: 'soil' },
  { keywords: ['удобрен', 'удобр', 'фертик', 'подкорм', 'стимул', 'инсектицид', 'фунгицид'], label: 'Удобрения', type: 'subcat', value: 'fertilizers' },
  // Accessories — Газоны и укрывной материал
  { keywords: ['укрывн', 'агротекст', 'спанбонд', 'геотекст', 'агро'], label: 'Укрывной материал', type: 'subcat', value: 'cover_fabric' },
  { keywords: ['мульч', 'теплиц'], label: 'Плёнка укрывная', type: 'subcat', value: 'cover_film' },
  { keywords: ['газон', 'искусств газ'], label: 'Искусственный газон', type: 'subcat', value: 'artificial_grass' },
  { keywords: ['семена', 'трав смес', 'газон сем'], label: 'Семена газона', type: 'subcat', value: 'grass_seed' },
  // Accessories — прочее
  { keywords: ['сад', 'огород', 'рассад', 'дача'], label: 'Сад и огород', type: 'subcat', value: 'garden' },
  { keywords: ['искусств'], label: 'Искусственные растения', type: 'subcat', value: 'artificial' },
  { keywords: ['игрушк', 'мягк', 'медвед', 'кукл'], label: 'Игрушки', type: 'subcat', value: 'toys' },
  // Cut flower subcategories (for when cut is re-enabled)
  { keywords: ['роза', 'розы', 'роз', 'rosa', 'rose'], label: '🌹 Розы', type: 'subcat', value: 'roses' },
  { keywords: ['хризант', 'хриз', 'chrys'], label: 'Хризантемы', type: 'subcat', value: 'chrysanthemums' },
  { keywords: ['тюльпан', 'tulip'], label: '🌷 Тюльпаны', type: 'subcat', value: 'tulips' },
  { keywords: ['пион', 'peony'], label: 'Пионы', type: 'subcat', value: 'peonies' },
  { keywords: ['лилия', 'лили', 'lily'], label: 'Лилии', type: 'subcat', value: 'lilies' },
  { keywords: ['герб', 'gerbera'], label: 'Герберы', type: 'subcat', value: 'gerberas' },
  { keywords: ['гвоздик', 'carnation'], label: 'Гвоздики', type: 'subcat', value: 'carnations' },
  { keywords: ['альстром', 'alstro'], label: 'Альстромерии', type: 'subcat', value: 'alstroemeria' },
  { keywords: ['орхид', 'orchid'], label: 'Орхидеи', type: 'subcat', value: 'orchids' },
  { keywords: ['антуриум', 'anthurium'], label: 'Антуриумы', type: 'subcat', value: 'anthuriums' },
  { keywords: ['гортензи', 'hydrangea'], label: 'Гортензии', type: 'subcat', value: 'hydrangeas' },
  { keywords: ['зелень', 'листь'], label: 'Зелень', type: 'subcat', value: 'greens' },
  // Colors
  { keywords: ['белый', 'белая', 'белые', 'бел', 'white'], label: '⬜ Белый', type: 'color', value: 'white' },
  { keywords: ['красный', 'красн', 'red'], label: '🔴 Красный', type: 'color', value: 'red' },
  { keywords: ['розовый', 'розов', 'pink'], label: '🩷 Розовый', type: 'color', value: 'pink' },
  { keywords: ['жёлтый', 'желтый', 'желт', 'yellow'], label: '🟡 Жёлтый', type: 'color', value: 'yellow' },
  { keywords: ['оранжевый', 'оранж', 'orange'], label: '🟠 Оранжевый', type: 'color', value: 'orange' },
  { keywords: ['фиолетовый', 'фиолет', 'purple'], label: '🟣 Фиолетовый', type: 'color', value: 'purple' },
  { keywords: ['лавандовый', 'лаванд', 'lavender'], label: 'Лавандовый', type: 'color', value: 'lavender' },
  { keywords: ['бордовый', 'бордов', 'бордо', 'burgundy'], label: '🍷 Бордовый', type: 'color', value: 'burgundy' },
  { keywords: ['зелёный', 'зеленый', 'зелен', 'green'], label: '🟢 Зелёный', type: 'color', value: 'green' },
  { keywords: ['кремовый', 'крем', 'cream'], label: 'Кремовый', type: 'color', value: 'cream' },
  { keywords: ['персиковый', 'персик', 'peach'], label: 'Персиковый', type: 'color', value: 'peach' },
  { keywords: ['коралловый', 'коралл', 'coral'], label: 'Коралловый', type: 'color', value: 'coral' },
]

function matchKeyword(kw: string, q: string): boolean {
  // keyword starts with query OR query starts with keyword (handles prefix matching in both directions)
  return kw.startsWith(q) || q.startsWith(kw)
}

// ── main component ───────────────────────────────────────────────────────────

export default function ProductGrid({ products: initialProducts }: { products: Product[] }) {
  const [products, setProducts] = useState(initialProducts)
  const [showAuth, setShowAuth] = useState(false)
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null)
  const [sort, setSort] = useState<SortKey>('popular')
  const [viewMode, setViewMode] = useState<'compact' | 'list'>('compact')

  const router = useRouter()
  const { items, add, update } = useCart()
  const { isAuthed } = useAuthStore()
  const { setProduct, flashCart, panel, productId, product: detailProduct, restoreProduct } = useDetailStore()
  const { setProducts: syncProducts, setFilteredCount } = useProductsStore()
  const isMobile = useIsMobile()
  const {
    category, group, subcat, varietyType, selectedLeaves, subgroup, colors, onlyDiscount, stockLevel, search,
    lengths, origins, farms, potSizes, volumeRanges, tags, seasons,
    setSearch, setSubcat, toggleTag, toggleColor, reset,
  } = useFilters()


  const suggestions = useMemo<SuggestionDef[]>(() => {
    const q = search.toLowerCase().trim()
    if (q.length < 2) return []
    return SMART_SUGGESTIONS
      .filter(s => s.keywords.some(kw => matchKeyword(kw, q)))
      .slice(0, 6)
  }, [search])

  function isSuggestionActive(s: SuggestionDef): boolean {
    if (s.type === 'subcat') return subcat === s.value
    if (s.type === 'tag')   return tags.includes(s.value)
    if (s.type === 'color') return colors.includes(s.value)
    return false
  }

  function applySuggestion(s: SuggestionDef) {
    if (s.type === 'subcat') {
      setSubcat(isSuggestionActive(s) ? '' : s.value) // toggle
    } else if (s.type === 'tag') {
      toggleTag(s.value)
    } else if (s.type === 'color') {
      toggleColor(s.value)
    }
    setSearch('')
  }

  // Sync products to global store so DetailPanel can look up by id
  useEffect(() => { syncProducts(products) }, [products])

  // Restore product detail / cart panel after page refresh
  const panelRestored = useRef(false)
  useEffect(() => {
    if (panelRestored.current || !productId) return
    panelRestored.current = true
    if (panel === 'detail' && !detailProduct) {
      const p = initialProducts.find(x => x.id === productId)
      if (p) restoreProduct(p)
    }
  }, [panel, productId, detailProduct])

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
      // accessories — мульти-выбор листьев (subcategory IN union(members)); cut/pot — одиночный subcat
      if (category === 'accessories') {
        // выбраны листья → по ним; иначе раздел (group); 'all' без выбора → все accessories
        const eff = selectedLeaves.length > 0 ? selectedLeaves : (group === 'all' ? [] : slugsForGroup(group))
        if (!subcatInLeaves(p.subcategory, eff)) return false
      } else {
        if (subcat && (p.subcategory || '') !== subcat) return false
        if (varietyType && (p.variety_type || '') !== varietyType) return false
      }
      if (subgroup && ((p as any).subgroup || '') !== subgroup) return false
      if (volumeRanges.length > 0) {
        const vol = Number((p as any).volume_l)
        if (!vol || !volumeRanges.some(id => VOLUME_RANGE_TEST[id]?.(vol))) return false
      }
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
        const normalizedOrigins = origins.map(o => ORIGIN_WORD_TO_ISO[o.toLowerCase()] ?? o)
        if (!src || !normalizedOrigins.includes(src)) return false
      }
      if (farms.length > 0) {
        const f = (p as any).farm ?? ''
        if (!f || !farms.includes(f)) return false
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
        const ptags = [
          ...(hasHit  ? ['hit']  : []),
          ...(hasSale ? ['sale'] : []),
          ...(hasNew  ? ['new']  : []),
          ...((p.tags ?? []) as string[]),
        ]
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
      // Default: новинки первыми, затем по убыванию остатка
      list = [...list].sort((a, b) => {
        if (a.is_new && !b.is_new) return -1
        if (!a.is_new && b.is_new) return 1
        return getAvailable(b.stock) - getAvailable(a.stock)
      })
    }

    return list
  }, [products, category, group, subcat, varietyType, selectedLeaves, subgroup, colors, onlyDiscount, stockLevel, search, lengths, origins, farms, potSizes, volumeRanges, tags, seasons, sort])

  // Sync filtered count for mobile "Show N results" button
  useEffect(() => { setFilteredCount(filtered.length) }, [filtered.length])

  const handleDec = (product: Product, qty: number) => requireAuth(() =>
    update(product.id, Math.max(0, qty - (product.pack_size || 5)))
  )
  const handleInc = (product: Product, qty: number, available: number, price: number) =>
    requireAuth(() => {
      const packSize = product.stems_per_pack || product.pack_size || 1
      if (qty === 0) {
        add({ id: product.id, name: (product.display_name || product.variety_name || product.name) + (product.length_str ? ' ' + product.length_str : ''), price, available, category: product.category, image_url: product.image_url, unit: (product as any).unit ?? null, subcategory: product.subcategory ?? null })
        update(product.id, packSize)
      } else {
        update(product.id, Math.min(qty + packSize, available))
      }
      if (!isMobile) flashCart(product) // на мобиле корзина открывается только явным нажатием
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

        {/* Row 1b: smart search suggestions */}
        {suggestions.length > 0 && (
          <div style={{
            padding: '0 16px 8px',
            display: 'flex', gap: 6, overflowX: 'auto',
            scrollbarWidth: 'none' as React.CSSProperties['scrollbarWidth'],
          }}>
            <style>{`#suggest-row::-webkit-scrollbar{display:none}`}</style>
            <span style={{ fontSize: 10, color: 'var(--text-mid)', whiteSpace: 'nowrap', alignSelf: 'center', marginRight: 2 }}>→</span>
            {suggestions.map((s, i) => {
              const active = isSuggestionActive(s)
              return (
              <button
                key={i}
                onClick={() => applySuggestion(s)}
                style={{
                  flexShrink: 0,
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '4px 11px', borderRadius: 14,
                  fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
                  background: active ? 'var(--accent)' : '#fff',
                  border: `1.5px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                  color: active ? '#fff' : 'var(--text)',
                  cursor: 'pointer',
                  transition: 'border-color 0.12s, color 0.12s, background 0.12s',
                }}
                onMouseEnter={e => {
                  if (active) return
                  const b = e.currentTarget as HTMLButtonElement
                  b.style.borderColor = 'var(--accent)'
                  b.style.color = 'var(--accent)'
                }}
                onMouseLeave={e => {
                  const b = e.currentTarget as HTMLButtonElement
                  b.style.borderColor = 'var(--border)'
                  b.style.color = 'var(--text)'
                }}
              >
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                {active ? '✕' : '+'}
                {s.label}
              </button>
              )}
            )}
          </div>
        )}

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

          {/* счётчик перенесён в CtxBar — здесь не дублируем */}
          {search && (
            <span style={{ fontSize: 11, color: 'var(--accent)', whiteSpace: 'nowrap', fontWeight: 600 }}>
              {filtered.length} поз.
            </span>
          )}
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
          (() => {
            const gridStyle: React.CSSProperties = {
              display: 'grid',
              gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
              gap: 12,
            }
            const renderCard = (p: Product) => {
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
            }
            return <div style={gridStyle}>{filtered.map(renderCard)}</div>
          })()
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

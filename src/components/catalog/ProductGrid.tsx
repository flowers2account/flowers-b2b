'use client'

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/auth-store'
import { useFilters } from '@/lib/filter-store'
import { useDetailStore } from '@/lib/detail-store'
import { useProductsStore } from '@/lib/products-store'
import { useIsMobile } from '@/lib/use-mobile'
import { useFilterChips } from '@/lib/filter-chips'
import { createClient } from '@/lib/supabase/client'
import AuthModal from './AuthModal'
import { type Product, getAvailable, getPrice } from './ProductCard'
import { colorSwatch, colorLabel, isLightSwatch, usableColors, normalizeColor } from '@/lib/colors'
import { useColorCart } from '@/lib/use-color-cart'
import { COUNTRY_LABELS, countryFlag } from '@/lib/countries'
import { unitForProduct, variantLabelForSubcat, subcatInLeaves, slugsForGroup } from '@/lib/category-tree'
import FavHeart from './FavHeart'
import SearchBox from './SearchBox'

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

// Диапазон объёма для accessories-фасета (синхронно с api/facets и FilterPanel)
function accVolumeRange(v: number): string | null {
  if (!v || v <= 0) return null
  if (v < 1)  return 'до 1л'
  if (v < 3)  return '1-3л'
  if (v < 6)  return '3-6л'
  if (v < 12) return '6-12л'
  return '12+л'
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
  if (qty === 0) {
    return (
      <span style={{
        position: 'absolute', bottom: 8, left: 8,
        background: 'rgba(200,50,50,0.85)', color: '#fff',
        fontFamily: 'var(--font-jetbrains, monospace)', fontSize: 10.5, fontWeight: 500,
        padding: '3px 9px', borderRadius: 'var(--radius-btn)', backdropFilter: 'blur(4px)',
      }}>
        Нет в наличии
      </span>
    )
  }
  return (
    <span style={{
      position: 'absolute', bottom: 8, left: 8,
      display: 'inline-flex', alignItems: 'center', gap: 6,
      background: 'rgba(33,26,30,0.8)', color: '#fff',
      fontFamily: 'var(--font-jetbrains, monospace)', fontSize: 10.5, fontWeight: 500,
      padding: '3px 9px 3px 8px', borderRadius: 'var(--radius-btn)', backdropFilter: 'blur(4px)',
    }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#5ED39A', boxShadow: '0 0 0 2px rgba(94,211,154,0.25)', flexShrink: 0 }} />
      {qty} {unit} в наличии
    </span>
  )
}

// ── stepper ─────────────────────────────────────────────────────────────────

function Stepper({
  qty, available, packSize, onDec, onInc, big, disabled,
}: {
  qty: number; available: number; packSize: number
  onDec: () => void; onInc: () => void; big?: boolean; disabled?: boolean
}) {
  const h = big ? 40 : 28
  const bw = big ? 42 : 28
  const fs = big ? 18 : 14
  const incDisabled = disabled || qty >= available
  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      border: '1px solid var(--border)', borderRadius: 'var(--radius-btn)',
      overflow: 'hidden', marginTop: big ? 12 : 8,
    }}>
      <button
        onClick={onDec}
        disabled={qty === 0}
        style={{
          width: bw, height: h, border: 'none',
          background: 'var(--bg2)', color: 'var(--accent)',
          fontSize: fs, fontWeight: 700, cursor: qty === 0 ? 'default' : 'pointer',
          opacity: qty === 0 ? 0.35 : 1,
        }}
      >−</button>
      <span style={{
        flex: 1, textAlign: 'center', fontSize: big ? 14 : 12, fontWeight: 700,
        padding: '6px 0', fontFamily: big ? 'var(--font-jetbrains, monospace)' : 'inherit',
        borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)',
      }}>
        {qty}
      </span>
      <button
        onClick={onInc}
        disabled={incDisabled}
        style={{
          width: bw, height: h, border: 'none',
          background: 'var(--bg2)', color: 'var(--accent)',
          fontSize: fs, fontWeight: 700, cursor: incDisabled ? 'default' : 'pointer',
          opacity: incDisabled ? 0.35 : 1,
        }}
      >+</button>
    </div>
  )
}

// ── grid card ───────────────────────────────────────────────────────────────

export function GridCard({
  product, isAuthed, requireAuth, onCardClick, onPickColor, onFlash,
}: {
  product: Product; isAuthed: boolean
  requireAuth: (fn: () => void) => void
  onCardClick: () => void
  onPickColor?: (slug: string) => void
  onFlash?: () => void
}) {
  const available = getAvailable(product.stock)
  const price = getPrice(product.stock)
  const hasDiscount = !!(product.previous_price && product.previous_price > price)
  const displayName = product.display_name || product.variety_name || product.name
  const packSize = product.stems_per_pack || product.pack_size || 1

  // Выбор цвета → корзина: ТА ЖЕ модель, что и в расширенной карточке (DetailPanel).
  const {
    colorList, colorMode, selectedSlug, setSelectedSlug,
    colorValue, colorRequired, qty, qtyBySlug, inc, dec,
  } = useColorCart(product, {
    available, packSize,
    makePayload: (color) => ({
      id: product.id,
      name: displayName + (product.length_str ? ' ' + product.length_str : ''),
      price, available, category: product.category, image_url: product.image_url,
      unit: (product as any).unit ?? null, subcategory: product.subcategory ?? null,
      color,
    }),
  })
  // Мультицвет (≥2 настоящих цвета) → кликабельные кружки-пикер + степпер по выбранному цвету.
  // Деградация: 1 цвет / ассорти / без colors → обычный степпер (цвет резолвится автоматически).
  const isMulti = colorMode === 'select' && colorList.length >= 2
  const doInc = () => requireAuth(() => { inc(); onFlash?.() })
  const doDec = () => requireAuth(() => { dec() })
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
      className="cat-card"
      style={{
        background: '#fff', border: `1px solid ${qty > 0 ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 12,
        boxShadow: qty > 0 ? '0 0 0 1px var(--accent)' : 'none',
        overflow: 'hidden', display: 'flex', flexDirection: 'column',
        cursor: 'pointer',
      }}
    >
      {/* Фото */}
      <div
        style={{ aspectRatio: '1 / 0.92', position: 'relative', background: 'var(--accent-light)', overflow: 'hidden' }}
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
            justifyContent: 'center', color: '#A8A4AD',
            background: 'linear-gradient(150deg,#F1ECE8,#E6DED7)',
          }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6 }}>
              <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.5-3.5L9 20" />
            </svg>
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
      <div style={{ padding: '13px 14px 14px', display: 'flex', flexDirection: 'column', flex: 1, gap: 2 }}>
        <div style={{
          fontFamily: 'var(--font-golos)', fontSize: 13.5, fontWeight: 600,
          lineHeight: 1.32, color: 'var(--text)', minHeight: 36,
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

        {/* Цвета. Мультицвет → кликабельный пикер (как в DetailPanel): выбор → активный цвет,
            бейдж-счётчик на каждом наборном цвете. Иначе — простой индикатор (до 5 + «+N»). */}
        {isMulti ? (
          <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 9, marginTop: 7, flexWrap: 'wrap', alignItems: 'center' }}>
            {colorList.map(slug => {
              const active = selectedSlug === slug
              const cnt = qtyBySlug[slug] ?? 0
              return (
                <button
                  key={slug}
                  title={colorLabel(slug)}
                  onClick={() => requireAuth(() => { setSelectedSlug(slug); onPickColor?.(slug) })}
                  style={{
                    position: 'relative', width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                    padding: 0, cursor: 'pointer', background: colorSwatch(slug),
                    border: active ? '2px solid var(--accent)' : `1px solid ${isLightSwatch(slug) ? '#D0D0D0' : 'rgba(0,0,0,0.18)'}`,
                    boxShadow: active ? '0 0 0 2px var(--bg)' : '0 0 0 1px var(--border) inset',
                  }}
                >
                  {cnt > 0 && (
                    <span style={{
                      position: 'absolute', top: -6, right: -6, minWidth: 14, height: 14, padding: '0 3px',
                      borderRadius: 7, background: 'var(--accent)', color: '#fff', fontSize: 8.5, fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
                    }}>{cnt}</span>
                  )}
                </button>
              )
            })}
          </div>
        ) : (() => {
          const keys = usableColors(product.colors?.length ? product.colors : product.color ? [product.color] : [])
          if (!keys.length) return null
          const shown = keys.slice(0, 5)
          const extra = keys.length - shown.length
          return (
            <div style={{ display: 'flex', gap: 7, marginTop: 7, flexWrap: 'wrap', alignItems: 'center' }}>
              {shown.map(c => (
                <div key={c} title={colorLabel(c)} style={{
                  width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                  boxShadow: '0 0 0 1px var(--border) inset',
                  background: colorSwatch(c),
                  // Белый/серебристый/светлый — тонкая рамка #D0D0D0, иначе кружок не виден на белом.
                  border: `1px solid ${isLightSwatch(c) ? '#D0D0D0' : 'rgba(0,0,0,0.1)'}`,
                }} />
              ))}
              {extra > 0 && (
                <span style={{ fontSize: 10, color: 'var(--text-mid)' }}>+{extra}</span>
              )}
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
                    <span style={{ fontFamily: 'var(--font-serif), serif', fontSize: 18, fontWeight: 700, color: 'var(--accent)', letterSpacing: '-0.01em' }}>
                      {price.toLocaleString('ru-RU')} ₸
                      {' '}<span style={{ fontFamily: 'var(--font-golos)', fontSize: 11, fontWeight: 500, color: 'var(--text-mid)' }}>/ {unit}</span>
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
                {product.pack_size > 1 && (unit !== 'шт' || product.category === 'accessories') && (
                  <span style={{ fontSize: 10, color: 'var(--text-mid)' }}>упаковка&nbsp;{product.pack_size}&nbsp;{unit}</span>
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
          {isMulti && (
            <div style={{ marginTop: 8, fontSize: 11, color: colorRequired ? '#E53935' : 'var(--text-mid)' }}>
              {colorRequired
                ? 'Выберите цвет'
                : <>Цвет: <span style={{ color: 'var(--text)', fontWeight: 600 }}>{colorValue}</span></>}
            </div>
          )}
          <Stepper qty={qty} available={available} packSize={packSize} onDec={doDec} onInc={doInc} big disabled={isMulti && colorRequired} />
        </div>
      </div>
    </div>
  )
}

// ── list row ─────────────────────────────────────────────────────────────────

function ListRow({
  product, isAuthed, requireAuth, onCardClick, onPickColor, onFlash,
}: {
  product: Product; isAuthed: boolean
  requireAuth: (fn: () => void) => void
  onCardClick: () => void
  onPickColor?: (slug: string) => void
  onFlash?: () => void
}) {
  const available = getAvailable(product.stock)
  const price = getPrice(product.stock)
  const hasDiscount = !!(product.previous_price && product.previous_price > price)
  const displayName = product.display_name || product.variety_name || product.name
  const packSize = product.stems_per_pack || product.pack_size || 1

  // Выбор цвета → корзина: ТА ЖЕ модель, что в клетке грида и DetailPanel.
  const {
    colorList, colorMode, selectedSlug, setSelectedSlug,
    colorValue, colorRequired, qty, qtyBySlug, inc, dec,
  } = useColorCart(product, {
    available, packSize,
    makePayload: (color) => ({
      id: product.id,
      name: displayName + (product.length_str ? ' ' + product.length_str : ''),
      price, available, category: product.category, image_url: product.image_url,
      unit: (product as any).unit ?? null, subcategory: product.subcategory ?? null,
      color,
    }),
  })
  const isMulti = colorMode === 'select' && colorList.length >= 2
  const doInc = () => requireAuth(() => { inc(); onFlash?.() })
  const doDec = () => requireAuth(() => { dec() })

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
          : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#A8A4AD', background: 'linear-gradient(150deg,#F1ECE8,#E6DED7)' }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6 }}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.5-3.5L9 20" /></svg></div>
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
          <span style={{ fontSize: 10, color: 'var(--text-mid)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {available === 0
              ? 'Нет в наличии'
              : <><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3DAE72', flexShrink: 0 }} />{available} {unitForProduct(product as any)} в наличии</>}
          </span>
          {product.country_iso && <CountryBadge iso={product.country_iso} />}
          {hasDiscount && <TagBadge type="sale" />}
        </div>

        {/* Мультицвет → кликабельные кружки-пикер + подпись выбранного цвета (как в клетке грида) */}
        {isMulti && (
          <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 9, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {colorList.map(slug => {
              const active = selectedSlug === slug
              const cnt = qtyBySlug[slug] ?? 0
              return (
                <button
                  key={slug}
                  title={colorLabel(slug)}
                  onClick={() => requireAuth(() => { setSelectedSlug(slug); onPickColor?.(slug) })}
                  style={{
                    position: 'relative', width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                    padding: 0, cursor: 'pointer', background: colorSwatch(slug),
                    border: active ? '2px solid var(--accent)' : `1px solid ${isLightSwatch(slug) ? '#D0D0D0' : 'rgba(0,0,0,0.18)'}`,
                    boxShadow: active ? '0 0 0 2px var(--bg)' : '0 0 0 1px var(--border) inset',
                  }}
                >
                  {cnt > 0 && (
                    <span style={{
                      position: 'absolute', top: -6, right: -6, minWidth: 13, height: 13, padding: '0 3px',
                      borderRadius: 7, background: 'var(--accent)', color: '#fff', fontSize: 8, fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
                    }}>{cnt}</span>
                  )}
                </button>
              )
            })}
            <span style={{ fontSize: 10.5, color: colorRequired ? '#E53935' : 'var(--text-mid)' }}>
              {colorRequired ? 'выберите цвет' : colorValue}
            </span>
          </div>
        )}
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
        <Stepper qty={qty} available={available} packSize={packSize} onDec={doDec} onInc={doInc} disabled={isMulti && colorRequired} />
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

// Поиск каталога вынесен в серверный путь: компонент SearchBox + /api/search
// (RPC search_products: ранжирование + similarity-фолбэк + синонимы). Клиентский
// includes-матч остался только как фолбэк в src/lib/catalog-search.ts.

// ── main component ───────────────────────────────────────────────────────────

export default function ProductGrid({ products: initialProducts }: { products: Product[] }) {
  const [products, setProducts] = useState(initialProducts)
  const [showAuth, setShowAuth] = useState(false)
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null)
  const [sort, setSort] = useState<SortKey>('popular')
  const [viewMode, setViewMode] = useState<'compact' | 'list'>('compact')

  const router = useRouter()
  const { isAuthed } = useAuthStore()
  const { setProduct, flashCart, panel, productId, product: detailProduct, restoreProduct } = useDetailStore()
  const { setProducts: syncProducts, setFilteredCount } = useProductsStore()
  const isMobile = useIsMobile()
  const {
    category, group, subcat, varietyType, selectedLeaves, subgroup, colors, onlyDiscount, stockLevel,
    lengths, origins, farms, potSizes, volumeRanges, tags, seasons,
    suppliers, materials, potColors, volumes,
    searchResultIds, searchActiveQuery, reset,
  } = useFilters()

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
    action()
  }, [])

  const chips = useFilterChips()

  // Filter
  const filtered = useMemo(() => {
    // Режим серверного поиска: показываем ранжированную выдачу /api/search (по всему
    // каталогу, без фасетных фильтров). Порядок = релевантность; сортировки цена/наличие
    // применяются поверх. Недоступные позиции скрываем (как в обычной витрине).
    if (searchResultIds) {
      const byId = new Map(products.map(p => [p.id, p]))
      let list = searchResultIds
        .map(id => byId.get(id))
        .filter((p): p is Product => !!p && getAvailable(p.stock) > 0)
      if (sort === 'price_asc') list = [...list].sort((a, b) => getPrice(a.stock) - getPrice(b.stock))
      else if (sort === 'price_desc') list = [...list].sort((a, b) => getPrice(b.stock) - getPrice(a.stock))
      else if (sort === 'stock') list = [...list].sort((a, b) => getAvailable(b.stock) - getAvailable(a.stock))
      return list
    }

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
      if (colors.length > 0) {
        // Матч по нормализованному цвету: фильтр «кремовый» ловит товарные «Крем 02»,
        // «antraciet» = «антрацит» и т.п. (Слой 3 цветовой системы).
        const want = new Set(colors.map(normalizeColor))
        const has = (p.colors ?? []).some(pc => want.has(normalizeColor(pc)))
          || (p.color != null && want.has(normalizeColor(p.color)))
        if (!has) return false
      }
      // Accessories-фасеты (И-логика; пустое поле просто не проходит свой активный фильтр)
      if (suppliers.length > 0) {
        const s = (p as any).supplier
        if (!s || !suppliers.includes(s)) return false
      }
      if (materials.length > 0) {
        const m = (p as any).pot_material
        if (!m || !materials.includes(m)) return false
      }
      if (potColors.length > 0) {
        const c = (p as any).pot_color
        if (!c || !potColors.includes(normalizeColor(c))) return false
      }
      if (volumes.length > 0) {
        const r = accVolumeRange(Number((p as any).volume_l))
        if (!r || !volumes.includes(r)) return false
      }
      if (available <= 0) return false
      if (stockLevel === 'low'  && available >= 50) return false
      if (stockLevel === 'high' && available < 50)  return false
      if (onlyDiscount && !hasDiscount) return false
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
      // Default: в общем списке accessories плёнка и бумага идут первыми,
      // затем новинки, затем по убыванию остатка.
      const PRIORITY: Record<string, number> = { film: 0, paper: 1 }
      const rank = (p: Product) =>
        category === 'accessories' ? (PRIORITY[p.subcategory ?? ''] ?? 9) : 0
      list = [...list].sort((a, b) => {
        const ra = rank(a), rb = rank(b)
        if (ra !== rb) return ra - rb
        if (a.is_new && !b.is_new) return -1
        if (!a.is_new && b.is_new) return 1
        return getAvailable(b.stock) - getAvailable(a.stock)
      })
    }

    return list
  }, [products, searchResultIds, category, group, subcat, varietyType, selectedLeaves, subgroup, colors, onlyDiscount, stockLevel, lengths, origins, farms, potSizes, volumeRanges, suppliers, materials, potColors, volumes, tags, seasons, sort])

  // Sync filtered count for mobile "Show N results" button
  useEffect(() => { setFilteredCount(filtered.length) }, [filtered.length])

  // Добавление в корзину (с выбором цвета) живёт внутри GridCard/ListRow через useColorCart —
  // здесь больше нет per-card обработчиков.

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <div style={{ background: '#fff', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {/* Row 1: поиск + сортировка + вид + счётчик — одна строка */}
        <div style={{ padding: '10px 16px 8px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* search — серверный поиск с автоподсказками */}
          <SearchBox products={products} />

          {/* sort */}
          <select
            value={sort}
            onChange={e => setSort(e.target.value as SortKey)}
            style={{
              height: 42, padding: '0 28px 0 12px', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-input)', fontSize: 12.5,
              background: '#fff', fontFamily: 'inherit', color: 'var(--text)',
              backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236B7570' stroke-width='2.5' stroke-linecap='round'><path d='M6 9l6 6 6-6'/></svg>\")",
              backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center', appearance: 'none',
              cursor: 'pointer', flexShrink: 0,
            }}
          >
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

          {/* view toggle */}
          <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 'var(--radius-btn)', overflow: 'hidden', flexShrink: 0 }}>
            {(['compact', 'list'] as const).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                title={v === 'compact' ? 'Сетка' : 'Список'}
                style={{
                  width: 38, height: 42, border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: viewMode === v ? 'var(--accent)' : '#fff',
                  color: viewMode === v ? '#fff' : '#b8b0b4',
                }}
              >
                {v === 'compact' ? <CompactIcon /> : <ListIcon />}
              </button>
            ))}
          </div>

          {/* count */}
          <span style={{ fontFamily: 'var(--font-jetbrains, monospace)', fontSize: 13, color: 'var(--text-mid)', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {filtered.length} {(() => { const a = filtered.length % 10, b = filtered.length % 100; if (a === 1 && b !== 11) return 'позиция'; if (a >= 2 && a <= 4 && (b < 10 || b >= 20)) return 'позиции'; return 'позиций' })()}
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
      <div
        style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', paddingBottom: isMobile ? 80 : 14 }}
        onScroll={(e) => {
          if (isMobile) return
          const y = (e.currentTarget as HTMLDivElement).scrollTop
          // Гистерезис: сворачиваем только при отступе > высоты полосы (58px) + запас,
          // разворачиваем только у самого верха. Между порогами состояние не трогаем —
          // иначе на «приграничном» контенте сворачивание само убирает переполнение и
          // начинается дёрганье (петля свернул→вырос→развернул→…).
          if (y > 80) document.documentElement.dataset.catScroll = 'down'
          else if (y < 8) delete document.documentElement.dataset.catScroll
        }}
      >
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-mid)', paddingTop: 64, fontSize: 13 }}>
            {searchResultIds && searchActiveQuery
              ? `Ничего не нашлось по «${searchActiveQuery}». Проверьте написание.`
              : 'Ничего не найдено'}
          </div>
        ) : viewMode !== 'list' ? (
          (() => {
            const gridStyle: React.CSSProperties = {
              display: 'grid',
              gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)',
              gap: isMobile ? 12 : 16,
            }
            const renderCard = (p: Product) => (
              <GridCard
                key={p.id}
                product={p}
                isAuthed={isAuthed}
                requireAuth={requireAuth}
                onCardClick={() => setProduct(p)}
                onPickColor={(slug) => setProduct(p, slug)}
                onFlash={() => { if (!isMobile) flashCart(p) }}
              />
            )
            return <div style={gridStyle}>{filtered.map(renderCard)}</div>
          })()
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(p => (
              <ListRow
                key={p.id}
                product={p}
                isAuthed={isAuthed}
                requireAuth={requireAuth}
                onCardClick={() => setProduct(p)}
                onPickColor={(slug) => setProduct(p, slug)}
                onFlash={() => { if (!isMobile) flashCart(p) }}
              />
            ))}
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

'use client'

import { ReactNode, useState, useEffect, useRef } from 'react'
import { useIsMobile } from '@/lib/use-mobile'
import { useDetailStore } from '@/lib/detail-store'
import { useFilters } from '@/lib/filter-store'
import { useCart } from '@/lib/cart-store'
import { useProductsStore } from '@/lib/products-store'
import { useFilterChips } from '@/lib/filter-chips'
import { useSheetBack } from '@/lib/use-sheet-back'

// header L1(58px) + L2(46px) = 104px
const HEADER_H = 104

function DragHandle() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 4px', flexShrink: 0 }}>
      <div style={{ width: 40, height: 4, borderRadius: 2, background: '#ddd' }} />
    </div>
  )
}

function BackBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 4,
        background: 'none', border: 'none',
        color: 'var(--accent)', fontSize: 13,
        padding: '8px 12px', cursor: 'pointer',
        fontFamily: 'inherit', fontWeight: 500,
        flexShrink: 0,
      }}
    >
      ← Каталог
    </button>
  )
}

function ChipBar() {
  const chips = useFilterChips()
  const { reset } = useFilters()
  if (!chips.length) return null
  return (
    <div style={{
      display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center',
      padding: '6px 14px 10px', borderBottom: '1px solid var(--border)',
      flexShrink: 0,
    }}>
      {chips.map((chip, i) => (
        <button
          key={i}
          onClick={chip.onRemove}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '3px 10px', borderRadius: 14, fontSize: 11,
            fontWeight: 500, fontFamily: 'inherit',
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
          marginLeft: 'auto', padding: '3px 10px', fontSize: 11,
          fontWeight: 500, fontFamily: 'inherit',
          background: 'none', border: '1px dashed var(--border)',
          borderRadius: 14, color: 'var(--text-mid)', cursor: 'pointer',
        }}
      >
        Сбросить
      </button>
    </div>
  )
}

export default function CatalogLayout({
  left, center, right,
}: {
  left: ReactNode; center: ReactNode; right: ReactNode
}) {
  const isMobile = useIsMobile()
  const [isFilterOpen, setIsFilterOpen] = useState(false)

  const { panel, setPanel } = useDetailStore()
  const { items, total } = useCart()
  const { filteredCount } = useProductsStore()
  const chips = useFilterChips()
  const {
    stockLevel, colors, lengths, origins, potSizes,
    tags, seasons, subcat,
  } = useFilters()

  const cartCount = items.reduce((s, i) => s + i.qty, 0)
  const cartTotal = total()

  const activeFiltersCount = [
    stockLevel !== '',
    colors.length > 0,
    lengths.length > 0,
    origins.length > 0,
    potSizes.length > 0,
    tags.length > 0,
    seasons.length > 0,
    subcat !== '',
  ].filter(Boolean).length

  const isDetailOpen = isMobile && panel !== 'empty'
  const mainRef = useRef<HTMLElement>(null)

  // Restore scroll position when returning from product page
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('catalog-scroll-restore')
      if (saved) {
        const y = parseInt(saved, 10)
        sessionStorage.removeItem('catalog-scroll-restore')
        requestAnimationFrame(() => {
          if (mainRef.current) mainRef.current.scrollTop = y
        })
      }
    } catch {}
  }, [])

  useEffect(() => {
    if (panel !== 'empty') setIsFilterOpen(false)
  }, [panel])

  useSheetBack(isDetailOpen, () => setPanel('empty'))
  useSheetBack(isMobile && isFilterOpen, () => setIsFilterOpen(false))

  // desktop layout
  if (!isMobile) {
    return (
      <div style={{
        display: 'grid',
        gridTemplateColumns: '200px 1fr 280px',
        height: `calc(100vh - ${HEADER_H}px)`,
      }}>
        <aside className="overflow-y-auto bg-white" style={{ borderRight: '1px solid var(--border)' }}>
          {left}
        </aside>
        <main
          ref={mainRef}
          className="overflow-y-auto bg-[#fafafa]"
          onScroll={() => {
            try { sessionStorage.setItem('catalog-scroll', String(mainRef.current?.scrollTop ?? 0)) } catch {}
          }}
        >
          {center}
        </main>
        <aside className="overflow-y-auto bg-white" style={{ borderLeft: '1px solid var(--border)' }}>
          {right}
        </aside>
      </div>
    )
  }

  // mobile layout
  return (
    <div style={{ position: 'relative' }}>

      {/* Main content */}
      <div style={{ paddingBottom: 80, background: '#fafafa' }}>
        {center}
      </div>

      {/* ── Filter bottom sheet ──────────────────────────────────── */}
      {isFilterOpen && (
        <div
          onClick={() => setIsFilterOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 49 }}
        />
      )}
      <div style={{
        position: 'fixed', top: `${HEADER_H}px`, bottom: 0, left: 0, right: 0,
        background: '#fff',
        borderRadius: '16px 16px 0 0',
        transform: isFilterOpen ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 0.3s ease',
        zIndex: 50, display: 'flex', flexDirection: 'column',
      }}>
        <DragHandle />
        <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <BackBtn onClick={() => setIsFilterOpen(false)} />
          <span style={{ fontFamily: 'var(--font-playfair)', fontSize: 15, marginLeft: 4 }}>Фильтры</span>
        </div>
        <ChipBar />
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {left}
        </div>
        <div style={{ padding: '10px 14px 16px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          <button
            onClick={() => setIsFilterOpen(false)}
            style={{
              width: '100%', padding: 12,
              background: 'var(--accent)', color: '#fff',
              border: 'none', borderRadius: 8,
              fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Показать {filteredCount} позиций
          </button>
        </div>
      </div>

      {/* ── Detail bottom sheet ──────────────────────────────────── */}
      {isDetailOpen && (
        <div
          onClick={() => setPanel('empty')}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 49 }}
        />
      )}
      <div style={{
        position: 'fixed', top: `${HEADER_H}px`, bottom: 0, left: 0, right: 0,
        background: '#fff',
        borderRadius: '16px 16px 0 0',
        transform: isDetailOpen ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 0.3s ease',
        zIndex: 50, display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <DragHandle />
        <div style={{
          display: 'flex', alignItems: 'center',
          background: 'var(--accent-light)', borderBottom: '1px solid var(--accent-mid)',
          flexShrink: 0,
        }}>
          <button
            onClick={() => setPanel('empty')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--accent)', fontSize: 14, fontFamily: 'inherit',
              fontWeight: 700, padding: '11px 14px',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
            К каталогу
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {right}
        </div>
      </div>

      {/* ── Bottom bar ───────────────────────────────────────────── */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        zIndex: 99,                                   // выше sheets (50) и below header (100)
        background: '#fff',
        borderTop: '1px solid var(--border-soft, #EFEAE5)',
        padding: '9px 12px',
        paddingBottom: 'calc(14px + env(safe-area-inset-bottom, 0px))',
        display: 'flex', gap: 8,
        boxShadow: '0 -4px 16px rgba(40,20,30,0.06)',
        transform: 'translateZ(0)',                   // GPU-слой — не прячется при скролле iOS
        WebkitTransform: 'translateZ(0)',
      } as React.CSSProperties}>
        {/* Фильтры — нейтральный стиль */}
        <button
          onClick={() => setIsFilterOpen(true)}
          style={{
            flex: 1, height: 44, border: '1px solid var(--border)',
            borderRadius: 10, background: 'var(--bg-soft, #F7F4F1)',
            color: 'var(--text)', fontSize: 13, fontWeight: 600,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/>
          </svg>
          Фильтры{activeFiltersCount > 0 ? ` (${activeFiltersCount})` : ''}
        </button>

        {/* Корзина — всегда видна, акцентный стиль */}
        <button
          onClick={() => setPanel('cart')}
          style={{
            flex: 1, height: 44, border: 'none',
            borderRadius: 10, background: 'var(--accent)',
            color: '#fff', fontSize: 13, fontWeight: 600,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>
          </svg>
          🛒 Корзина
          {cartCount > 0 && (
            <span style={{
              fontFamily: 'var(--font-jetbrains, monospace)',
              fontSize: 10, fontWeight: 600,
              padding: '2px 6px', background: 'rgba(255,255,255,0.18)',
              borderRadius: 8, marginLeft: 2,
            }}>
              {cartCount} · {cartTotal.toLocaleString('ru-RU')} ₸
            </span>
          )}
        </button>
      </div>
    </div>
  )
}

'use client'

import { useMemo, useState } from 'react'
import type { PfCatalogItem } from '@/lib/pod-zakaz/types'
import { usePfCart } from '@/lib/pod-zakaz/pf-cart-store'
import { usePfFilters, type PfSortKey } from '@/lib/pod-zakaz/use-pf-filters'
import { stepPrice, stepLabel } from '@/lib/pod-zakaz/format'
import { useIsMobile } from '@/lib/use-mobile'
import PfProductCard from './PfProductCard'
import PfFilterPanel from './PfFilterPanel'
import PfCartPanel from './PfCartPanel'
import PfLayout from './PfLayout'
import PfDetailPanel from './PfDetailPanel'
import { usePfDetail } from '@/lib/pod-zakaz/pf-detail-store'

const SORT_OPTIONS: { value: PfSortKey; label: string }[] = [
  { value: 'default', label: 'По умолчанию' },
  { value: 'price_asc', label: 'Цена ↑' },
  { value: 'price_desc', label: 'Цена ↓' },
  { value: 'stock', label: 'По наличию' },
]

// Сетка теми же брейкпоинтами, что ProductGrid (3 колонки / 2 на мобильном). Фильтры/сортировка
// живут в изолированном хуке usePfFilters — не в глобальных сторах основного каталога.
export default function PfGrid({ products }: { products: PfCatalogItem[] }) {
  const [cartOpen, setCartOpen] = useState(false)
  const { items, setQty } = usePfCart()
  const openDetail = usePfDetail(s => s.open)
  const isMobile = useIsMobile()
  const {
    category, setCategory, categories,
    subcategory, setSubcategory, subcategoryOptions,
    rawSearch, setRawSearch,
    selectedColors, toggleColor, colorOptions,
    selectedCountries, toggleCountry, countryOptions,
    sort, setSort,
    filtered,
    hasActiveFilters, resetAll,
  } = usePfFilters(products)

  const qtyByOffer = useMemo(() => new Map(items.map(i => [i.pfOfferId, i.qty])), [items])
  const cartCount = items.reduce((s, i) => s + i.qty, 0)

  function handleSetQty(item: PfCatalogItem, qty: number) {
    setQty({
      pfOfferId: item.pf_offer_id,
      name: item.name,
      imageUrl: item.image_url,
      colorName: item.color_name,
      isBoxOnly: item.is_box_only,
      stepLabel: stepLabel(item),
      stepPrice: stepPrice(item),
    }, qty)
  }

  const left = (
    <PfFilterPanel
      category={category}
      setCategory={setCategory}
      categories={categories}
      totalCount={products.length}
      subcategory={subcategory}
      setSubcategory={setSubcategory}
      subcategoryOptions={subcategoryOptions}
      selectedColors={selectedColors}
      toggleColor={toggleColor}
      colorOptions={colorOptions}
      selectedCountries={selectedCountries}
      toggleCountry={toggleCountry}
      countryOptions={countryOptions}
      onResetAll={resetAll}
    />
  )

  const center = (
    <div>
      {/* Toolbar: поиск + сортировка + счётчик + корзина — одной строкой, как в каталоге */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        padding: '10px 16px', background: '#fff', borderBottom: '1px solid var(--border)',
      }}>
        <input
          value={rawSearch}
          onChange={(e) => setRawSearch(e.target.value)}
          placeholder="Поиск по названию…"
          style={{
            height: 42, padding: '0 12px', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-input)', fontSize: 13, fontFamily: 'inherit',
            minWidth: 180, flex: '1 1 220px',
          }}
        />

        <select
          value={sort}
          onChange={e => setSort(e.target.value as PfSortKey)}
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

        <span style={{ fontFamily: 'var(--font-jetbrains, monospace)', fontSize: 13, color: 'var(--text-mid)', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {filtered.length} {(() => { const a = filtered.length % 10, b = filtered.length % 100; if (a === 1 && b !== 11) return 'позиция'; if (a >= 2 && a <= 4 && (b < 10 || b >= 20)) return 'позиции'; return 'позиций' })()}
        </span>

        <button
          onClick={() => setCartOpen(true)}
          style={{
            marginLeft: 'auto', height: 42, padding: '0 18px',
            background: 'var(--accent)', color: '#fff', border: 'none',
            borderRadius: 'var(--radius-btn)', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
            display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0,
          }}
        >
          Корзина
          {cartCount > 0 && (
            <span style={{
              minWidth: 18, height: 18, borderRadius: 9, background: 'rgba(255,255,255,0.25)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, padding: '0 5px',
            }}>
              {cartCount}
            </span>
          )}
        </button>
      </div>

      {/* Grid */}
      <div style={{ padding: '16px' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-mid)', paddingTop: 64, fontSize: 13 }}>
            {hasActiveFilters ? (
              <>
                <div style={{ marginBottom: 12 }}>Ничего не найдено по выбранным фильтрам.</div>
                <button
                  onClick={resetAll}
                  style={{
                    padding: '8px 16px', background: 'var(--accent)', color: '#fff', border: 'none',
                    borderRadius: 'var(--radius-btn)', fontSize: 13, fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  Сбросить фильтры
                </button>
              </>
            ) : (
              'Пока нет доступных позиций — загляните позже.'
            )}
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)',
            gap: isMobile ? 12 : 16,
          }}>
            {filtered.map(item => (
              <PfProductCard
                key={item.pf_offer_id}
                item={item}
                qty={qtyByOffer.get(item.pf_offer_id) ?? 0}
                onSetQty={(q) => handleSetQty(item, q)}
                onCardClick={() => openDetail(item.pf_offer_id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )

  const right = <PfDetailPanel products={products} onOpenCart={() => setCartOpen(true)} />

  return (
    <>
      <PfLayout left={left} center={center} right={right} />
      {cartOpen && <PfCartPanel onClose={() => setCartOpen(false)} products={products} />}
    </>
  )
}

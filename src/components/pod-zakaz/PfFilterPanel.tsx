'use client'

import { colorSwatch } from '@/lib/colors'
import type { PfFacetOption } from '@/lib/pod-zakaz/use-pf-filters'

// Визуальные примитивы — по образцу FilterPanel.tsx (CheckRow/TagChips/CollapsibleGroup) и
// CategoryTabs.tsx (табы с border-bottom на активной), адаптированы под светлый фон pod-zakaz
// (у CategoryTabs — тёмный хедер). Токены те же: var(--accent), var(--border), var(--text-mid).

type Props = {
  category: string
  setCategory: (v: string) => void
  categories: PfFacetOption[]
  totalCount: number
  rawSearch: string
  setRawSearch: (v: string) => void
  selectedColors: string[]
  toggleColor: (v: string) => void
  colorOptions: PfFacetOption[]
  selectedCountries: string[]
  toggleCountry: (v: string) => void
  countryOptions: PfFacetOption[]
  activeFilterCount: number
  onResetAll: () => void
}

function CategoryTab({
  active, label, count, onClick,
}: { active: boolean; label: string; count: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 'none', height: 42, padding: '0 14px', background: 'none', border: 'none',
        cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
        color: active ? 'var(--accent)' : 'var(--text-mid)',
        borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
      }}
    >
      {label} <span style={{ opacity: 0.6, fontWeight: 500 }}>({count})</span>
    </button>
  )
}

function ChipToggle({
  active, label, swatch, onClick,
}: { active: boolean; label: string; swatch?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 14,
        fontSize: 11.5, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer',
        background: active ? 'var(--accent)' : '#fff',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
        color: active ? '#fff' : 'var(--text-mid)',
      }}
    >
      {swatch && (
        <span style={{
          width: 10, height: 10, borderRadius: '50%', flexShrink: 0, background: swatch,
          border: `1px solid ${active ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.15)'}`,
        }} />
      )}
      {label}
    </button>
  )
}

export default function PfFilterPanel({
  category, setCategory, categories, totalCount,
  rawSearch, setRawSearch,
  selectedColors, toggleColor, colorOptions,
  selectedCountries, toggleCountry, countryOptions,
  activeFilterCount, onResetAll,
}: Props) {
  return (
    <div style={{ background: '#fff', borderBottom: '1px solid var(--border)' }}>
      {/* Категория — вкладки, только nomenclature_name (id/тип торгового дня сюда не попадают) */}
      <div style={{ display: 'flex', gap: 2, overflowX: 'auto', padding: '0 16px', scrollbarWidth: 'thin' }}>
        <CategoryTab active={category === ''} label="Все" count={totalCount} onClick={() => setCategory('')} />
        {categories.map((c) => (
          <CategoryTab
            key={c.value}
            active={category === c.value}
            label={c.value}
            count={c.count}
            onClick={() => setCategory(c.value)}
          />
        ))}
      </div>

      {/* Поиск + цвет + страна */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, padding: '10px 16px' }}>
        <input
          value={rawSearch}
          onChange={(e) => setRawSearch(e.target.value)}
          placeholder="Поиск по названию…"
          style={{
            height: 38, padding: '0 12px', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-input)', fontSize: 13, fontFamily: 'inherit',
            minWidth: 200, flex: '1 1 200px',
          }}
        />

        {colorOptions.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {colorOptions.map((c) => (
              <ChipToggle
                key={c.value}
                active={selectedColors.includes(c.value)}
                label={c.value}
                swatch={colorSwatch(c.value)}
                onClick={() => toggleColor(c.value)}
              />
            ))}
          </div>
        )}

        {countryOptions.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {countryOptions.map((c) => (
              <ChipToggle
                key={c.value}
                active={selectedCountries.includes(c.value)}
                label={c.value}
                onClick={() => toggleCountry(c.value)}
              />
            ))}
          </div>
        )}

        {activeFilterCount > 0 && (
          <button
            onClick={onResetAll}
            style={{
              marginLeft: 'auto', padding: '5px 10px', fontSize: 11, fontWeight: 500,
              fontFamily: 'inherit', background: 'none', border: '1px dashed var(--border)',
              borderRadius: 14, color: 'var(--text-mid)', cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            Сбросить всё
          </button>
        )}
      </div>
    </div>
  )
}

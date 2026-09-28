'use client'

import { useState } from 'react'
import { colorSwatch, colorLabel, isLightSwatch } from '@/lib/colors'
import type { PfFacetOption } from '@/lib/pod-zakaz/use-pf-filters'

// Левый сайдбар — примитивы группы (CollapsibleGroup/StaticGroup/Chevron/countBadge) взяты
// по образцу src/components/catalog/FilterPanel.tsx, адаптированы под плоские (не древовидные)
// pod-zakaz-фасеты: Цвет (кружки, always-open), Категория и Страна (чекбоксы со счётчиком).

type Props = {
  category: string
  setCategory: (v: string) => void
  categories: PfFacetOption[]
  totalCount: number
  subcategory: string
  setSubcategory: (v: string) => void
  subcategoryOptions: PfFacetOption[]
  selectedColors: string[]
  toggleColor: (v: string) => void
  colorOptions: PfFacetOption[]
  selectedCountries: string[]
  toggleCountry: (v: string) => void
  countryOptions: PfFacetOption[]
  onResetAll: () => void
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="10" height="10" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
      style={{ flexShrink: 0, transition: 'transform 0.18s', transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}
    >
      <path d="M9 18l6-6-6-6"/>
    </svg>
  )
}

function CountBadge({ count, active }: { count: number; active: boolean }) {
  return (
    <span style={{
      fontSize: 10, padding: '2px 7px', borderRadius: 10, fontWeight: 500,
      flexShrink: 0, marginLeft: 'auto',
      background: active ? 'rgba(255,255,255,0.22)' : 'var(--bg2)',
      color: active ? '#fff' : 'var(--text-mid)',
    }}>
      {count}
    </span>
  )
}

function CollapsibleGroup({
  label, children, activeCount = 0, open, onToggle,
}: {
  label: string; children: React.ReactNode
  activeCount?: number; open: boolean; onToggle: () => void
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 4px', background: 'none', border: 'none',
          cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        <Chevron open={open} />
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
          textTransform: 'uppercase', color: '#b9aab1',
          flex: 1, textAlign: 'left',
        }}>
          {label}
        </span>
        {activeCount > 0 && (
          <span style={{
            background: 'var(--accent)', color: '#fff',
            borderRadius: '50%', width: 16, height: 16, flexShrink: 0,
            fontSize: 9, fontWeight: 700,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {activeCount}
          </span>
        )}
      </button>
      {open && <div style={{ marginTop: 2 }}>{children}</div>}
    </div>
  )
}

function StaticGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{
        fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
        textTransform: 'uppercase', color: '#b9aab1', padding: '5px 4px',
      }}>
        {label}
      </div>
      <div style={{ marginTop: 2 }}>{children}</div>
    </div>
  )
}

function OptionRow({
  active, label, count, onClick,
}: { active: boolean; label: string; count: number; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '5px 8px', fontSize: 12,
        borderRadius: 'var(--radius-btn)', marginBottom: 1,
        cursor: 'pointer', transition: 'background 0.12s',
        background: active ? 'var(--accent)' : undefined,
        color: active ? '#fff' : 'var(--text)',
        fontWeight: active ? 600 : 400,
      }}
    >
      <span style={{ flex: 1 }}>{label}</span>
      <CountBadge count={count} active={active} />
    </div>
  )
}

export default function PfFilterPanel({
  category, setCategory, categories, totalCount,
  subcategory, setSubcategory, subcategoryOptions,
  selectedColors, toggleColor, colorOptions,
  selectedCountries, toggleCountry, countryOptions,
  onResetAll,
}: Props) {
  const [openCategory, setOpenCategory] = useState(true)
  const [openSubcategory, setOpenSubcategory] = useState(true)
  const [openCountry, setOpenCountry] = useState(true)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '14px 14px 0' }}>

        {/* Цвет — кружки, всегда открыт, как в боевом каталоге */}
        {colorOptions.length > 0 && (
          <StaticGroup label="Цвет">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '4px 4px 0' }}>
              {colorOptions.map((c) => {
                const selected = selectedColors.includes(c.value)
                return (
                  <div
                    key={c.value}
                    onClick={() => toggleColor(c.value)}
                    title={`${colorLabel(c.value)} (${c.count})`}
                    style={{
                      width: 20, height: 20, borderRadius: '50%',
                      cursor: 'pointer', flexShrink: 0,
                      background: colorSwatch(c.value),
                      border: `1.5px solid ${isLightSwatch(c.value) ? '#D0D0D0' : 'rgba(0,0,0,0.12)'}`,
                      outline: selected ? '2px solid var(--accent)' : 'none',
                      outlineOffset: 2,
                      transition: 'opacity 0.2s',
                    }}
                  />
                )
              })}
            </div>
          </StaticGroup>
        )}

        {/* Категория */}
        <CollapsibleGroup
          label="Категория"
          open={openCategory}
          onToggle={() => setOpenCategory(v => !v)}
          activeCount={category ? 1 : 0}
        >
          <OptionRow active={category === ''} label="Все" count={totalCount} onClick={() => setCategory('')} />
          {categories.map((c) => (
            <OptionRow
              key={c.value}
              active={category === c.value}
              label={c.value}
              count={c.count}
              onClick={() => setCategory(c.value)}
            />
          ))}
        </CollapsibleGroup>

        {/* Подкатегория — только внутри выбранной категории (см. use-pf-filters.ts:
            при «Все» листья разных номенклатур семантически не связаны, список бы не имел
            смысла). Появляется/исчезает вместе с выбором категории. */}
        {category && subcategoryOptions.length > 0 && (
          <CollapsibleGroup
            label="Подкатегория"
            open={openSubcategory}
            onToggle={() => setOpenSubcategory(v => !v)}
            activeCount={subcategory ? 1 : 0}
          >
            <OptionRow
              active={subcategory === ''}
              label="Все"
              count={subcategoryOptions.reduce((s, o) => s + o.count, 0)}
              onClick={() => setSubcategory('')}
            />
            {subcategoryOptions.map((s) => (
              <OptionRow
                key={s.value}
                active={subcategory === s.value}
                label={s.value}
                count={s.count}
                onClick={() => setSubcategory(s.value)}
              />
            ))}
          </CollapsibleGroup>
        )}

        {/* Страна */}
        {countryOptions.length > 0 && (
          <CollapsibleGroup
            label="Страна"
            open={openCountry}
            onToggle={() => setOpenCountry(v => !v)}
            activeCount={selectedCountries.length}
          >
            {countryOptions.map((c) => (
              <label
                key={c.value}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '5px 8px', fontSize: 12,
                  borderRadius: 'var(--radius-btn)', cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox" checked={selectedCountries.includes(c.value)}
                  onChange={() => toggleCountry(c.value)}
                  style={{ width: 14, height: 14, accentColor: 'var(--accent)', cursor: 'pointer' }}
                />
                <span style={{ flex: 1 }}>{c.value}</span>
                <span style={{ fontSize: 10, color: 'var(--text-mid)' }}>{c.count}</span>
              </label>
            ))}
          </CollapsibleGroup>
        )}

        <div style={{ height: 8 }} />
      </div>

      {/* Sticky reset button */}
      <div style={{
        flexShrink: 0, padding: '10px 14px',
        borderTop: '1px solid var(--border)', background: '#fff',
      }}>
        <button
          onClick={onResetAll}
          style={{
            width: '100%', padding: 8,
            background: '#fff', border: '1px dashed var(--border)',
            borderRadius: 'var(--radius-btn)',
            fontSize: 11, color: 'var(--text-mid)', fontWeight: 500,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          Сбросить фильтры
        </button>
      </div>
    </div>
  )
}

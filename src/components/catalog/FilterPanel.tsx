'use client'

import { useMemo } from 'react'
import { useFilters } from '@/lib/filter-store'
import { type Product } from './ProductCard'

const COLORS = [
  { hex: '#E53935', label: 'Красный' },
  { hex: '#F5F5F5', label: 'Белый' },
  { hex: '#E91E8C', label: 'Розовый' },
  { hex: '#FDD835', label: 'Жёлтый' },
  { hex: '#7B1FA2', label: 'Сиреневый' },
]
const LENGTHS = [40, 50, 60, 70, 80]
const ORIGINS = ['Эквадор', 'Кения', 'Голландия', 'Китай']
const TAGS = [
  { id: 'hit', label: '🔥 Хит' },
  { id: 'sale', label: '🏷 Акция' },
  { id: 'new', label: '🆕 Новинка' },
]

function GroupLabel({ text }: { text: string }) {
  return (
    <div style={{
      fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
      textTransform: 'uppercase', color: '#b9aab1',
      marginBottom: 6, padding: '0 4px',
    }}>
      {text}
    </div>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: 30, height: 17, borderRadius: 9,
        background: checked ? 'var(--fern)' : '#ccc',
        position: 'relative', cursor: 'pointer', flexShrink: 0,
        transition: 'background 0.18s',
      }}
    >
      <div style={{
        position: 'absolute', top: 2,
        left: checked ? 15 : 2,
        width: 13, height: 13,
        borderRadius: '50%', background: '#fff',
        transition: 'left 0.18s',
      }} />
    </div>
  )
}

export default function FilterPanel({ products }: { products: Product[] }) {
  const {
    category, subcat, onlyAvailable, search, colors, lengths, origins, tags,
    setSubcat, setOnlyAvailable, setSearch,
    toggleColor, toggleLength, toggleOrigin, toggleTag, reset,
  } = useFilters()

  const subcats = useMemo(() => {
    const base = category === 'all' ? products : products.filter(p => p.category === category)
    const counts: Record<string, number> = {}
    base.forEach(p => { counts[p.name] = (counts[p.name] || 0) + 1 })
    return [
      { key: '', label: 'Все', count: base.length },
      ...Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => ({ key: name, label: name, count })),
    ]
  }, [products, category])

  const showCutFilters = category === 'cut'

  const row = (key: string, label: string, count: number) => {
    const active = subcat === key
    return (
      <div
        key={key}
        onClick={() => setSubcat(key)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '5px 8px', fontSize: 12, borderRadius: 'var(--radius-btn)',
          marginBottom: 1, cursor: 'pointer',
          background: active ? 'var(--accent)' : 'transparent',
          color: active ? '#fff' : 'var(--text)',
          fontWeight: active ? 600 : 400,
        }}
      >
        <span>{label}</span>
        <span style={{
          fontSize: 10, padding: '2px 7px', borderRadius: 10, fontWeight: 500,
          background: active ? 'rgba(255,255,255,0.22)' : 'var(--bg2)',
          color: active ? '#fff' : 'var(--text-mid)',
        }}>
          {count}
        </span>
      </div>
    )
  }

  return (
    <div style={{ padding: '14px 14px 24px', height: '100%' }}>

      {/* ПОИСК */}
      <div style={{ marginBottom: 18 }}>
        <GroupLabel text="Поиск" />
        <div style={{ position: 'relative' }}>
          <svg style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
            width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9CA39E" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>
          </svg>
          <input
            type="text"
            placeholder="Сорт, ферма…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-input)',
              padding: '6px 8px 6px 26px',
              fontSize: 12, fontFamily: 'inherit',
              color: 'var(--text)', background: '#fff', outline: 'none',
            }}
          />
        </div>
      </div>

      {/* ПОДКАТЕГОРИЯ */}
      <div style={{ marginBottom: 18 }}>
        <GroupLabel text="Подкатегория" />
        {subcats.map(s => row(s.key, s.label, s.count))}
      </div>

      {/* НАЛИЧИЕ */}
      <div style={{ marginBottom: 18 }}>
        <GroupLabel text="Наличие" />
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '7px 8px', fontSize: 12,
          background: 'var(--bg2)', borderRadius: 'var(--radius-btn)',
        }}>
          <span>Только в наличии</span>
          <Toggle checked={onlyAvailable} onChange={setOnlyAvailable} />
        </div>
      </div>

      {/* ЦВЕТ */}
      <div style={{ marginBottom: 18 }}>
        <GroupLabel text="Цвет" />
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', padding: '4px 4px 0' }}>
          {COLORS.map(c => (
            <div
              key={c.hex}
              onClick={() => toggleColor(c.hex)}
              title={c.label}
              style={{
                width: 22, height: 22, borderRadius: '50%',
                background: c.hex,
                border: '1.5px solid rgba(0,0,0,0.06)',
                cursor: 'pointer',
                outline: colors.includes(c.hex) ? '2px solid var(--accent)' : 'none',
                outlineOffset: 2,
              }}
            />
          ))}
        </div>
      </div>

      {/* ДЛИНА — только cut */}
      {showCutFilters && (
        <div style={{ marginBottom: 18 }}>
          <GroupLabel text="Длина, см" />
          {LENGTHS.map(l => (
            <label
              key={l}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '5px 8px', fontSize: 12,
                borderRadius: 'var(--radius-btn)', cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={lengths.includes(l)}
                onChange={() => toggleLength(l)}
                style={{ width: 14, height: 14, accentColor: 'var(--accent)', cursor: 'pointer' }}
              />
              <span style={{ flex: 1 }}>{l >= 80 ? '80+ см' : `${l} см`}</span>
            </label>
          ))}
        </div>
      )}

      {/* ИСТОЧНИК — только cut */}
      {showCutFilters && (
        <div style={{ marginBottom: 18 }}>
          <GroupLabel text="Источник" />
          {ORIGINS.map(o => (
            <label
              key={o}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '5px 8px', fontSize: 12,
                borderRadius: 'var(--radius-btn)', cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={origins.includes(o)}
                onChange={() => toggleOrigin(o)}
                style={{ width: 14, height: 14, accentColor: 'var(--accent)', cursor: 'pointer' }}
              />
              <span>{o}</span>
            </label>
          ))}
        </div>
      )}

      {/* ТЕГИ */}
      <div style={{ marginBottom: 18 }}>
        <GroupLabel text="Теги" />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '2px 4px 0' }}>
          {TAGS.map(t => {
            const active = tags.includes(t.id)
            return (
              <button
                key={t.id}
                onClick={() => toggleTag(t.id)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '4px 10px', borderRadius: 14,
                  fontSize: 11, fontWeight: 500, fontFamily: 'inherit',
                  background: active ? 'var(--accent)' : '#fff',
                  border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                  color: active ? '#fff' : 'var(--text-mid)',
                  cursor: 'pointer',
                }}
              >
                {t.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Сбросить */}
      <button
        onClick={reset}
        style={{
          width: '100%', padding: 8, marginTop: 6,
          background: '#fff', border: '1px dashed var(--border)',
          borderRadius: 'var(--radius-btn)',
          fontSize: 11, color: 'var(--text-mid)', fontWeight: 500,
          cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        Сбросить фильтры
      </button>
    </div>
  )
}

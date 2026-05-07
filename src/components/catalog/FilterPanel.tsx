'use client'

import { useMemo } from 'react'
import { useFilters } from '@/lib/filter-store'
import { type Product } from './ProductCard'

// ── static configs ────────────────────────────────────────────────────────────

const SUBCATS: Record<string, string[]> = {
  cut:    ['Розы', 'Хризантемы', 'Акцентные', 'Наполнители', 'Зелень', 'Сезонные', 'Экзотика'],
  pot:    ['Зелёные', 'Цветущие', 'Суккуленты', 'Уличные', 'Крупномеры'],
  supply: ['Упаковка', 'Горшки', 'Грунты', 'Удобрения', 'Инструмент'],
}

const COLORS = [
  { hex: '#E53935', label: 'Красный' },
  { hex: '#F5F5F5', label: 'Белый' },
  { hex: '#E91E8C', label: 'Розовый' },
  { hex: '#FDD835', label: 'Жёлтый' },
  { hex: '#7B1FA2', label: 'Сиреневый' },
]
const LENGTHS = [40, 50, 60, 70, 80]
const ORIGINS = ['Эквадор', 'Кения', 'Голландия', 'Китай']
const POT_SIZES = [
  { id: 'до12',  label: 'до 12 см' },
  { id: '14-17', label: '14–17 см' },
  { id: '19-23', label: '19–23 см' },
  { id: '25+',   label: '25+ см' },
]
const TAGS_CUT = [
  { id: 'hit',  label: '🔥 Хит' },
  { id: 'sale', label: '🏷 Акция' },
  { id: 'new',  label: '🆕 Новинка' },
]
const TAGS_POT = [
  { id: 'hit', label: '🔥 Хит' },
  { id: 'new', label: '🆕 Новинка' },
]

// ── primitives ────────────────────────────────────────────────────────────────

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

function CheckRow({
  checked, label, onChange,
}: { checked: boolean; label: string; onChange: () => void }) {
  return (
    <label style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '5px 8px', fontSize: 12,
      borderRadius: 'var(--radius-btn)', cursor: 'pointer',
    }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        style={{ width: 14, height: 14, accentColor: 'var(--accent)', cursor: 'pointer' }}
      />
      <span style={{ flex: 1 }}>{label}</span>
    </label>
  )
}

function TagChips({
  tagDefs,
  active,
  onToggle,
}: {
  tagDefs: { id: string; label: string }[]
  active: string[]
  onToggle: (id: string) => void
}) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '2px 4px 0' }}>
      {tagDefs.map(t => {
        const on = active.includes(t.id)
        return (
          <button
            key={t.id}
            onClick={() => onToggle(t.id)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '4px 10px', borderRadius: 14,
              fontSize: 11, fontWeight: 500, fontFamily: 'inherit',
              background: on ? 'var(--accent)' : '#fff',
              border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
              color: on ? '#fff' : 'var(--text-mid)',
              cursor: 'pointer',
            }}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}

// ── main ──────────────────────────────────────────────────────────────────────

export default function FilterPanel({ products }: { products: Product[] }) {
  const {
    category, subcat, onlyAvailable, search,
    colors, lengths, origins, potSizes, tags,
    setSubcat, setOnlyAvailable, setSearch,
    toggleColor, toggleLength, toggleOrigin, togglePotSize, toggleTag, reset,
  } = useFilters()

  // Subcategory counts from DB field
  const subcatRows = useMemo(() => {
    const base = products.filter(p => category === 'all' || p.category === category)
    const counts: Record<string, number> = {}
    base.forEach(p => { if (p.subcategory) counts[p.subcategory] = (counts[p.subcategory] || 0) + 1 })
    const list = SUBCATS[category] ?? []
    return [
      { key: '', label: 'Все', count: base.length },
      ...list.map(sc => ({ key: sc, label: sc, count: counts[sc] ?? 0 })),
    ]
  }, [products, category])

  type SubcatRowData = { key: string; label: string; count: number }
  const SubcatRow = ({ row }: { row: SubcatRowData }) => {
    const active = subcat === row.key
    return (
      <div
        onClick={() => setSubcat(row.key)}
        className={active ? '' : 'hover:bg-[var(--bg2)]'}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '5px 8px', fontSize: 12, borderRadius: 'var(--radius-btn)',
          marginBottom: 1, cursor: 'pointer',
          background: active ? 'var(--accent)' : undefined,
          color: active ? '#fff' : 'var(--text)',
          fontWeight: active ? 600 : 400,
          transition: 'background 0.12s',
        }}
      >
        <span>{row.label}</span>
        <span style={{
          fontSize: 10, padding: '2px 7px', borderRadius: 10, fontWeight: 500,
          background: active ? 'rgba(255,255,255,0.22)' : 'var(--bg2)',
          color: active ? '#fff' : 'var(--text-mid)',
          flexShrink: 0,
        }}>
          {row.count}
        </span>
      </div>
    )
  }

  const Group = ({ children, mb = 18 }: { children: React.ReactNode; mb?: number }) => (
    <div style={{ marginBottom: mb }}>{children}</div>
  )

  return (
    <div style={{ padding: '14px 14px 24px', height: '100%' }}>

      {/* ПОИСК — всегда */}
      <Group>
        <GroupLabel text="Поиск" />
        <div style={{ position: 'relative' }}>
          <svg
            style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
            width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9CA39E" strokeWidth="2" strokeLinecap="round"
          >
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
      </Group>

      {/* ПОДКАТЕГОРИЯ — всегда */}
      <Group>
        <GroupLabel text="Подкатегория" />
        {subcatRows.map(s => <SubcatRow key={s.key} row={s} />)}
      </Group>

      {/* НАЛИЧИЕ — всегда */}
      <Group>
        <GroupLabel text="Наличие" />
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '7px 8px', fontSize: 12,
          background: 'var(--bg2)', borderRadius: 'var(--radius-btn)',
        }}>
          <span>Только в наличии</span>
          <Toggle checked={onlyAvailable} onChange={setOnlyAvailable} />
        </div>
      </Group>

      {/* ── CUT: Цвет, Длина, Источник, Теги ── */}
      {category === 'cut' && (
        <>
          <Group>
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
          </Group>

          <Group>
            <GroupLabel text="Длина стебля" />
            {LENGTHS.map(l => (
              <CheckRow
                key={l}
                checked={lengths.includes(l)}
                label={l >= 80 ? '80+ см' : `${l} см`}
                onChange={() => toggleLength(l)}
              />
            ))}
          </Group>

          <Group>
            <GroupLabel text="Источник" />
            {ORIGINS.map(o => (
              <CheckRow
                key={o}
                checked={origins.includes(o)}
                label={o}
                onChange={() => toggleOrigin(o)}
              />
            ))}
          </Group>

          <Group>
            <GroupLabel text="Теги" />
            <TagChips tagDefs={TAGS_CUT} active={tags} onToggle={toggleTag} />
          </Group>
        </>
      )}

      {/* ── POT: Размер горшка, Теги ── */}
      {category === 'pot' && (
        <>
          <Group>
            <GroupLabel text="Размер горшка" />
            {POT_SIZES.map(ps => (
              <CheckRow
                key={ps.id}
                checked={potSizes.includes(ps.id)}
                label={ps.label}
                onChange={() => togglePotSize(ps.id)}
              />
            ))}
          </Group>

          <Group>
            <GroupLabel text="Теги" />
            <TagChips tagDefs={TAGS_POT} active={tags} onToggle={toggleTag} />
          </Group>
        </>
      )}

      {/* SUPPLY: только Поиск + Подкатегория + Наличие (уже выше) */}

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

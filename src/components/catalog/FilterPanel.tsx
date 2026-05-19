'use client'

import { useMemo, useState, useEffect } from 'react'
import { useFilters } from '@/lib/filter-store'
import { COLORS } from '@/lib/colors'
import { type Product, getAvailable } from './ProductCard'
import { ORIGIN_LABELS } from '@/lib/filter-chips'

// ── category tree ─────────────────────────────────────────────────────────────

type VarietyChild = { label: string; varietyType: string }
type SubcatNode   = { label: string; key: string; children?: VarietyChild[] }

const CATEGORY_TREE: Record<string, SubcatNode[]> = {
  cut: [
    { label: 'Розы', key: 'roses', children: [
      { label: 'Одноголовые',      varietyType: 'single' },
      { label: 'Кустовые / Спрей', varietyType: 'spray'  },
    ]},
    { label: 'Хризантемы', key: 'chrysanthemums', children: [
      { label: 'Одноголовые (Disbud)', varietyType: 'single'     },
      { label: 'Кустовые / Spray',     varietyType: 'spray'      },
      { label: 'Помпонные',            varietyType: 'pompom'     },
      { label: 'Пионовидные',          varietyType: 'decorative' },
    ]},
    { label: 'Гвоздики', key: 'carnations', children: [
      { label: 'Одноголовые',      varietyType: 'single' },
      { label: 'Ветковые / Спрей', varietyType: 'spray'  },
    ]},
    { label: 'Лилии', key: 'lilies', children: [
      { label: 'ОТ-гибриды',  varietyType: 'ot'       },
      { label: 'Восточные',   varietyType: 'oriental' },
      { label: 'Азиатские',   varietyType: 'asian'    },
    ]},
    { label: 'Гортензии',           key: 'hydrangeas'   },
    { label: 'Лизиантус / Эустома', key: 'lisianthus'   },
    { label: 'Тюльпаны',            key: 'tulips'       },
    { label: 'Герберы',             key: 'gerberas'     },
    { label: 'Каллы',               key: 'callas'       },
    { label: 'Ирисы',               key: 'irises'       },
    { label: 'Альстромерия',        key: 'alstroemeria' },
    { label: 'Акцентные цветы',     key: 'accents'      },
    { label: 'Наполнители',         key: 'fillers'      },
    { label: 'Зелень',              key: 'greens'       },
    { label: 'Сезонные',            key: 'seasonal'     },
    { label: 'Весенние',            key: 'spring'       },
    { label: 'Экзотика',            key: 'exotic'       },
  ],
  pot: [
    { label: 'Зелёные растения',     key: 'green'       },
    { label: 'Цветущие',             key: 'flowering'   },
    { label: 'Суккуленты и кактусы', key: 'succulents'  },
    { label: 'Уличные и сезонные',   key: 'outdoor'     },
    { label: 'Крупномеры',           key: 'large'       },
  ],
  supply: [
    { label: 'Упаковка',               key: 'packaging'   },
    { label: 'Горшки и кашпо',         key: 'pots'        },
    { label: 'Грунты и субстраты',     key: 'soil'        },
    { label: 'Удобрения и уход',       key: 'fertilizers' },
    { label: 'Инструмент и материалы', key: 'tools'       },
  ],
}

// ── static filter options ─────────────────────────────────────────────────────


const LENGTHS_FALLBACK = [40, 50, 60, 70, 80]
const ORIGINS_FALLBACK = ['ecuador', 'kenya', 'holland', 'china', 'russia', 'colombia']
const SEASON_LABELS: Record<string, string> = {
  spring: 'Весна', summer: 'Лето', autumn: 'Осень',
  winter: 'Зима', year: 'Круглый год', year_round: 'Круглый год',
}
const POT_SIZES = [
  { id: 'до12',  label: 'до 12 см' },
  { id: '14-17', label: '14–17 см' },
  { id: '19-23', label: '19–23 см' },
  { id: '25+',   label: '25+ см'   },
]
const TAGS_CUT = [
  { id: 'hit',  label: '🔥 Хит'     },
  { id: 'sale', label: '🏷 Акция'   },
  { id: 'new',  label: '🆕 Новинка' },
]
const TAGS_POT = [
  { id: 'hit', label: '🔥 Хит'     },
  { id: 'new', label: '🆕 Новинка' },
]
const SEASONS = [
  { id: 'spring', label: 'Весна'      },
  { id: 'summer', label: 'Лето'       },
  { id: 'autumn', label: 'Осень'      },
  { id: 'winter', label: 'Зима'       },
  { id: 'year',   label: 'Круглый год'},
]

// ── default group open state ──────────────────────────────────────────────────

const DEFAULT_OPEN = {
  available: true,
  subcat: true,
  length: false, origin: false,
  season: false, tags: false, potSize: false,
}

// ── primitives ────────────────────────────────────────────────────────────────


function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      role="switch" aria-checked={checked}
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

function CheckRow({ checked, label, onChange }: { checked: boolean; label: string; onChange: () => void }) {
  return (
    <label style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '5px 8px', fontSize: 12,
      borderRadius: 'var(--radius-btn)', cursor: 'pointer',
    }}>
      <input
        type="checkbox" checked={checked} onChange={onChange}
        style={{ width: 14, height: 14, accentColor: 'var(--accent)', cursor: 'pointer' }}
      />
      <span style={{ flex: 1 }}>{label}</span>
    </label>
  )
}

function TagChips({ tagDefs, active, onToggle }: {
  tagDefs: { id: string; label: string }[]
  active: string[]
  onToggle: (id: string) => void
}) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '2px 4px 0' }}>
      {tagDefs.map(t => {
        const on = active.includes(t.id)
        return (
          <button key={t.id} onClick={() => onToggle(t.id)} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '4px 10px', borderRadius: 14,
            fontSize: 11, fontWeight: 500, fontFamily: 'inherit',
            background: on ? 'var(--accent)' : '#fff',
            border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
            color: on ? '#fff' : 'var(--text-mid)',
            cursor: 'pointer',
          }}>
            {t.label}
          </button>
        )
      })}
    </div>
  )
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

// ── CollapsibleGroup ──────────────────────────────────────────────────────────

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

// ── StaticGroup — always open, no chevron ────────────────────────────────────

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

// ── accordion subcategory section ─────────────────────────────────────────────

function AccordionSubcats({ products }: { products: Product[] }) {
  const { category, subcat, varietyType, setSubcat, setVarietyType, facets } = useFilters()
  const [openItem, setOpenItem] = useState('')

  useEffect(() => { setOpenItem('') }, [category])

  // Auto-open selected subcat to show variety types
  useEffect(() => { if (subcat) setOpenItem(subcat) }, [subcat])

  const { bySC, byVT } = useMemo(() => {
    const base = products.filter(p => category === 'all' || p.category === category)
    const bySC: Record<string, number> = {}
    const byVT: Record<string, Record<string, number>> = {}
    base.forEach(p => {
      if (!p.subcategory) return
      if (getAvailable(p.stock) <= 0) return
      bySC[p.subcategory] = (bySC[p.subcategory] || 0) + 1
      if (p.variety_type) {
        if (!byVT[p.subcategory]) byVT[p.subcategory] = {}
        byVT[p.subcategory][p.variety_type] = (byVT[p.subcategory][p.variety_type] || 0) + 1
      }
    })
    return { bySC, byVT }
  }, [products, category])

  // When subcat is selected — show only that node; otherwise show all with stock
  const allNodes = (CATEGORY_TREE[category] ?? []).filter(node => (bySC[node.key] ?? 0) > 0)
  const nodes = subcat
    ? allNodes.filter(n => n.key === subcat)
    : allNodes

  const handleParent = (node: SubcatNode) => {
    if (node.children?.length) {
      setOpenItem(prev => prev === node.key ? '' : node.key)
    }
    setSubcat(node.key)
    setVarietyType('')
  }

  const handleChild = (parentKey: string, child: VarietyChild) => {
    setSubcat(parentKey)
    setVarietyType(child.varietyType)
    setOpenItem(parentKey)
  }

  const countBadge = (count: number, active: boolean) => (
    <span style={{
      fontSize: 10, padding: '2px 7px', borderRadius: 10, fontWeight: 500,
      flexShrink: 0, marginLeft: 'auto',
      background: active ? 'rgba(255,255,255,0.22)' : 'var(--bg2)',
      color: active ? '#fff' : 'var(--text-mid)',
    }}>
      {count}
    </span>
  )

  const rowBase: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '5px 8px', fontSize: 12,
    borderRadius: 'var(--radius-btn)', marginBottom: 1,
    cursor: 'pointer', transition: 'background 0.12s',
  }

  return (
    <div>
      {nodes.map(node => {
        const hasChildren = !!(node.children?.length)
        const isOpen      = openItem === node.key
        const parentSel   = subcat === node.key && varietyType === ''
        const hasActiveCh = subcat === node.key && varietyType !== ''

        return (
          <div key={node.key}>
            <div
              onClick={() => handleParent(node)}
              className={parentSel || hasActiveCh ? '' : 'hover:bg-[var(--bg2)]'}
              style={{
                ...rowBase,
                background: parentSel
                  ? 'var(--accent)'
                  : hasActiveCh
                    ? 'var(--bg2)'
                    : undefined,
                color: parentSel ? '#fff' : 'var(--text)',
                fontWeight: parentSel ? 600 : 400,
              }}
            >
              {hasChildren && <Chevron open={isOpen} />}
              <span style={{ flex: 1 }}>{node.label}</span>
              {countBadge(facets?.subcatCounts?.[node.key] ?? bySC[node.key] ?? 0, parentSel)}
            </div>

            {hasChildren && isOpen && node.children!.filter(child => (byVT[node.key]?.[child.varietyType] ?? 0) > 0).map(child => {
              const childActive = subcat === node.key && varietyType === child.varietyType
              const childCount  = byVT[node.key]?.[child.varietyType] ?? 0
              return (
                <div
                  key={child.varietyType}
                  onClick={() => handleChild(node.key, child)}
                  className={childActive ? '' : 'hover:bg-[var(--bg2)]'}
                  style={{
                    ...rowBase,
                    paddingLeft: 22,
                    background: childActive ? 'var(--accent)' : undefined,
                    color: childActive ? '#fff' : 'var(--text-mid)',
                    fontWeight: childActive ? 600 : 400,
                  }}
                >
                  <span style={{ fontSize: 10, opacity: 0.5, marginRight: 2 }}>•</span>
                  <span style={{ flex: 1, fontSize: 11 }}>{child.label}</span>
                  {countBadge(facets?.vtCounts?.[child.varietyType] ?? childCount, childActive)}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

// ── main ──────────────────────────────────────────────────────────────────────

export default function FilterPanel({ products }: { products: Product[] }) {
  const {
    category, subcat, varietyType,
    colors, lengths, origins, potSizes, tags,
    seasons, stockLevel, onlyAvailable, facets,
    setStockLevel, setSubcat, setVarietyType,
    toggleColor, toggleLength, toggleOrigin, togglePotSize, toggleTag,
    toggleSeason, reset, loadFacets,
  } = useFilters()

  const [openGroups, setOpenGroups] = useState({ ...DEFAULT_OPEN })

  // Recalculate facets when structural filters change (not colors — standard faceting behavior)
  useEffect(() => { loadFacets() }, [category, subcat, varietyType, onlyAvailable])

  // Reset group open states when category changes
  useEffect(() => { setOpenGroups({ ...DEFAULT_OPEN }) }, [category])

  // Auto-open groups that have active filters
  useEffect(() => {
    setOpenGroups(prev => {
      const next = { ...prev }
      if (lengths.length > 0)     next.length    = true
      if (origins.length > 0)     next.origin    = true
      if (seasons.length > 0)     next.season    = true
      if (tags.length > 0)        next.tags      = true
      if (potSizes.length > 0)    next.potSize   = true
      if (subcat)                 next.subcat    = true
      return next
    })
  }, [lengths, origins, seasons, tags, potSizes, subcat])

  const tog = (key: keyof typeof DEFAULT_OPEN) =>
    setOpenGroups(prev => ({ ...prev, [key]: !prev[key] }))

  const subcatActiveCount = subcat ? (varietyType ? 2 : 1) : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '14px 14px 0' }}>

        {/* ЦВЕТ — cut only, always open */}
        {category === 'cut' && (
          <StaticGroup label="Цвет">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '4px 4px 0' }}>
              {COLORS.map(c => {
                const selected = colors.includes(c.key)
                return (
                  <div
                    key={c.key}
                    onClick={() => toggleColor(c.key)}
                    title={c.label}
                    style={{
                      width: 20, height: 20, borderRadius: '50%',
                      cursor: 'pointer', flexShrink: 0,
                      background: ('gradient' in c ? c.gradient : c.bg) as string,
                      border: `1.5px solid ${'border' in c ? c.border : '#E0E0E0'}`,
                      boxShadow: c.key === 'white' ? 'inset 0 0 0 1px #c8c8c8' : 'none',
                      outline: selected ? '2px solid var(--accent)' : 'none',
                      outlineOffset: 2,
                    }}
                  />
                )
              })}
            </div>
          </StaticGroup>
        )}

        {/* 3. ПОДКАТЕГОРИЯ */}
        <CollapsibleGroup
          label="Подкатегория"
          open={openGroups.subcat}
          onToggle={() => { tog('subcat'); setSubcat(''); setVarietyType('') }}
          activeCount={subcatActiveCount}
        >
          <AccordionSubcats products={products} />
        </CollapsibleGroup>

        {/* 4–8. CUT-only filters */}
        {category === 'cut' && (
          <>
            <CollapsibleGroup
              label="Длина стебля"
              open={openGroups.length}
              onToggle={() => tog('length')}
              activeCount={lengths.length}
            >
              {(facets
                ? Object.entries(facets.lengthCounts)
                    .map(([l, count]) => ({ value: Number(l), count }))
                    .sort((a, b) => a.value - b.value)
                : LENGTHS_FALLBACK.map(l => ({ value: l, count: null }))
              ).map(({ value: l, count }) => {
                const dimmed = facets !== null && (count ?? 0) === 0 && !lengths.includes(l)
                return (
                  <label
                    key={l}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '5px 8px', fontSize: 12,
                      borderRadius: 'var(--radius-btn)',
                      cursor: dimmed ? 'default' : 'pointer',
                      opacity: dimmed ? 0.25 : 1,
                      transition: 'opacity 0.2s',
                    }}
                  >
                    <input
                      type="checkbox" checked={lengths.includes(l)}
                      onChange={() => !dimmed && toggleLength(l)}
                      disabled={dimmed}
                      style={{ width: 14, height: 14, accentColor: 'var(--accent)', cursor: dimmed ? 'default' : 'pointer' }}
                    />
                    <span style={{ flex: 1 }}>{l} см</span>
                    {count !== null && <span style={{ fontSize: 10, color: 'var(--text-mid)' }}>{count}</span>}
                  </label>
                )
              })}
            </CollapsibleGroup>

            <CollapsibleGroup
              label="Источник"
              open={openGroups.origin}
              onToggle={() => tog('origin')}
              activeCount={origins.length}
            >
              {(facets
                ? Object.entries(facets.originCounts)
                    .map(([key, count]) => ({ key, label: ORIGIN_LABELS[key] ?? key, count }))
                    .sort((a, b) => a.label.localeCompare(b.label))
                : ORIGINS_FALLBACK.map(key => ({ key, label: ORIGIN_LABELS[key] ?? key, count: null }))
              ).map(({ key, label, count }) => {
                const dimmed = facets !== null && (count ?? 0) === 0 && !origins.includes(key)
                return (
                  <label
                    key={key}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '5px 8px', fontSize: 12,
                      borderRadius: 'var(--radius-btn)',
                      cursor: dimmed ? 'default' : 'pointer',
                      opacity: dimmed ? 0.25 : 1,
                      transition: 'opacity 0.2s',
                    }}
                  >
                    <input
                      type="checkbox" checked={origins.includes(key)}
                      onChange={() => !dimmed && toggleOrigin(key)}
                      disabled={dimmed}
                      style={{ width: 14, height: 14, accentColor: 'var(--accent)', cursor: dimmed ? 'default' : 'pointer' }}
                    />
                    <span style={{ flex: 1 }}>{label}</span>
                    {count !== null && <span style={{ fontSize: 10, color: 'var(--text-mid)' }}>{count}</span>}
                  </label>
                )
              })}
            </CollapsibleGroup>

            <CollapsibleGroup
              label="Сезон"
              open={openGroups.season}
              onToggle={() => tog('season')}
              activeCount={seasons.length}
            >
              {(facets
                ? Object.entries(facets.seasonCounts)
                    .map(([key, count]) => ({ key, label: SEASON_LABELS[key] ?? key, count }))
                : SEASONS.map(s => ({ key: s.id, label: s.label, count: null }))
              ).map(({ key, label, count }) => {
                const dimmed = facets !== null && (count ?? 0) === 0 && !seasons.includes(key)
                return (
                  <label
                    key={key}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '5px 8px', fontSize: 12,
                      borderRadius: 'var(--radius-btn)',
                      cursor: dimmed ? 'default' : 'pointer',
                      opacity: dimmed ? 0.25 : 1,
                      transition: 'opacity 0.2s',
                    }}
                  >
                    <input
                      type="checkbox" checked={seasons.includes(key)}
                      onChange={() => !dimmed && toggleSeason(key)}
                      disabled={dimmed}
                      style={{ width: 14, height: 14, accentColor: 'var(--accent)', cursor: dimmed ? 'default' : 'pointer' }}
                    />
                    <span style={{ flex: 1 }}>{label}</span>
                    {count !== null && <span style={{ fontSize: 10, color: 'var(--text-mid)' }}>{count}</span>}
                  </label>
                )
              })}
            </CollapsibleGroup>

            <CollapsibleGroup
              label="Теги"
              open={openGroups.tags}
              onToggle={() => tog('tags')}
              activeCount={tags.length}
            >
              <TagChips tagDefs={TAGS_CUT} active={tags} onToggle={toggleTag} />
            </CollapsibleGroup>
          </>
        )}

        {/* POT-specific filters */}
        {category === 'pot' && (
          <>
            <CollapsibleGroup
              label="Размер горшка"
              open={openGroups.potSize}
              onToggle={() => tog('potSize')}
              activeCount={potSizes.length}
            >
              {POT_SIZES.map(ps => (
                <CheckRow key={ps.id} checked={potSizes.includes(ps.id)}
                  label={ps.label} onChange={() => togglePotSize(ps.id)} />
              ))}
            </CollapsibleGroup>

            <CollapsibleGroup
              label="Теги"
              open={openGroups.tags}
              onToggle={() => tog('tags')}
              activeCount={tags.length}
            >
              <TagChips tagDefs={TAGS_POT} active={tags} onToggle={toggleTag} />
            </CollapsibleGroup>
          </>
        )}

        {/* ОСТАТОК — мало / много (внизу, по умолчанию не активен) */}
        <div style={{ display: 'flex', gap: 6, marginTop: 10, marginBottom: 4 }}>
          {([
            { id: 'low',  label: '🔴 Мало',  hint: '< 50 шт' },
            { id: 'high', label: '🟢 Много', hint: '≥ 50 шт' },
          ] as const).map(opt => (
            <button
              key={opt.id}
              onClick={() => setStockLevel(stockLevel === opt.id ? '' : opt.id)}
              title={opt.hint}
              style={{
                flex: 1, height: 32, border: `1px solid ${stockLevel === opt.id ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 'var(--radius-btn)', fontSize: 12, fontWeight: stockLevel === opt.id ? 600 : 400,
                background: stockLevel === opt.id ? 'var(--accent-light)' : 'var(--bg2)',
                color: stockLevel === opt.id ? 'var(--accent)' : 'var(--text-mid)',
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >{opt.label}</button>
          ))}
        </div>

        {/* bottom padding so last item isn't behind sticky button */}
        <div style={{ height: 8 }} />
      </div>

      {/* Sticky reset button */}
      <div style={{
        flexShrink: 0, padding: '10px 14px',
        borderTop: '1px solid var(--border)', background: '#fff',
      }}>
        <button
          onClick={reset}
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

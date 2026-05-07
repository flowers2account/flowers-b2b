'use client'

import { useMemo, useState, useEffect } from 'react'
import { useFilters } from '@/lib/filter-store'
import { type Product } from './ProductCard'

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

const COLORS = [
  { key: 'white',         label: 'Белый',         bg: '#FFFFFF', border: '#E0E0E0' },
  { key: 'cream',         label: 'Кремовый',       bg: '#FFF8E7', border: '#E8D8A0' },
  { key: 'pink',          label: 'Розовый',        bg: '#FFB6C1', border: '#E991A0' },
  { key: 'peach',         label: 'Персиковый',     bg: '#FFCBA4', border: '#E8A87C' },
  { key: 'red',           label: 'Красный',        bg: '#E53935', border: '#C62828' },
  { key: 'bordeaux',      label: 'Бордовый',       bg: '#7B1A2E', border: '#5C1220' },
  { key: 'orange',        label: 'Оранжевый',      bg: '#FF7043', border: '#E64A19' },
  { key: 'yellow',        label: 'Жёлтый',         bg: '#FDD835', border: '#F9A825' },
  { key: 'lavender',      label: 'Лавандовый',     bg: '#CE93D8', border: '#AB47BC' },
  { key: 'purple',        label: 'Фиолетовый',     bg: '#7B1FA2', border: '#6A1B9A' },
  { key: 'green',         label: 'Зелёный',        bg: '#66BB6A', border: '#388E3C' },
  { key: 'mix',           label: 'Микс',           gradient: 'conic-gradient(#E53935 0deg,#FDD835 90deg,#66BB6A 180deg,#7B1FA2 270deg,#E53935 360deg)' },
  { key: 'mix_pink',      label: 'Пинк микс',      gradient: 'linear-gradient(135deg,#FFB6C1 50%,#FFFFFF 50%)' },
  { key: 'mix_red_white', label: 'Красно-белый',   gradient: 'linear-gradient(135deg,#E53935 50%,#FFFFFF 50%)' },
] as const
const LENGTHS   = [40, 50, 60, 70, 80]
const ORIGINS   = ['Эквадор', 'Кения', 'Голландия', 'Китай']
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
const FLORAL_ROLES = [
  { id: 'focal',   label: 'Фокусный',    icon: '🌹' },
  { id: 'mass',    label: 'Массовый',    icon: '🌸' },
  { id: 'line',    label: 'Линейный',    icon: '🌿' },
  { id: 'filler',  label: 'Наполнитель', icon: '🍃' },
  { id: 'texture', label: 'Текстура',    icon: '✨' },
  { id: 'foliage', label: 'Зелень',      icon: '🌱' },
]
const DURATIONS = [
  { id: '3-5', label: '3–5 дней' },
  { id: '5-7', label: '5–7 дней' },
  { id: '7+',  label: '7+ дней'  },
]
const SEASONS = [
  { id: 'spring', label: 'Весна'      },
  { id: 'summer', label: 'Лето'       },
  { id: 'autumn', label: 'Осень'      },
  { id: 'winter', label: 'Зима'       },
  { id: 'year',   label: 'Круглый год'},
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

// ── accordion subcategory section ─────────────────────────────────────────────

function AccordionSubcats({ products }: { products: Product[] }) {
  const { category, subcat, varietyType, setSubcat, setVarietyType } = useFilters()
  const [openItem, setOpenItem] = useState('')

  // Reset accordion when category changes
  useEffect(() => { setOpenItem('') }, [category])

  // Counts
  const { total, bySC, byVT } = useMemo(() => {
    const base = products.filter(p => category === 'all' || p.category === category)
    const bySC: Record<string, number> = {}
    const byVT: Record<string, Record<string, number>> = {}
    base.forEach(p => {
      if (!p.subcategory) return
      bySC[p.subcategory] = (bySC[p.subcategory] || 0) + 1
      if (p.variety_type) {
        if (!byVT[p.subcategory]) byVT[p.subcategory] = {}
        byVT[p.subcategory][p.variety_type] = (byVT[p.subcategory][p.variety_type] || 0) + 1
      }
    })
    return { total: base.length, bySC, byVT }
  }, [products, category])

  const nodes = CATEGORY_TREE[category] ?? []

  const handleAll = () => {
    setSubcat('')
    setVarietyType('')
    setOpenItem('')
  }

  const handleParent = (node: SubcatNode) => {
    if (node.children?.length) {
      // toggle: open this one, close if already open
      setOpenItem(prev => prev === node.key ? '' : node.key)
    }
    setSubcat(node.key)
    setVarietyType('')
  }

  const handleChild = (parentKey: string, child: VarietyChild) => {
    setSubcat(parentKey)
    setVarietyType(child.varietyType)
    setOpenItem(parentKey) // keep parent open
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

  const allActive = subcat === ''

  return (
    <div>
      {/* Все */}
      <div
        onClick={handleAll}
        className={allActive ? '' : 'hover:bg-[var(--bg2)]'}
        style={{
          ...rowBase,
          background: allActive ? 'var(--accent)' : undefined,
          color: allActive ? '#fff' : 'var(--text)',
          fontWeight: allActive ? 600 : 400,
        }}
      >
        <span style={{ flex: 1 }}>Все</span>
        {countBadge(total, allActive)}
      </div>

      {/* Tree nodes */}
      {nodes.map(node => {
        const hasChildren = !!(node.children?.length)
        const isOpen      = openItem === node.key
        const parentSel   = subcat === node.key && varietyType === ''
        const hasActiveCh = subcat === node.key && varietyType !== ''

        return (
          <div key={node.key}>
            {/* Parent row */}
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
              {hasChildren && (
                <Chevron open={isOpen} />
              )}
              <span style={{ flex: 1 }}>{node.label}</span>
              {countBadge(bySC[node.key] ?? 0, parentSel)}
            </div>

            {/* Children */}
            {hasChildren && isOpen && node.children!.map(child => {
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
                  {countBadge(childCount, childActive)}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

// ── Group helper — defined OUTSIDE FilterPanel so its reference stays stable ──

function Group({ children, mb = 18 }: { children: React.ReactNode; mb?: number }) {
  return <div style={{ marginBottom: mb }}>{children}</div>
}

// ── main ──────────────────────────────────────────────────────────────────────

export default function FilterPanel({ products }: { products: Product[] }) {
  const {
    category, onlyAvailable, search,
    colors, lengths, origins, potSizes, tags,
    floralRoles, durations, seasons,
    setOnlyAvailable, setSearch,
    toggleColor, toggleLength, toggleOrigin, togglePotSize, toggleTag,
    toggleFloralRole, toggleDuration, toggleSeason, reset,
  } = useFilters()

  return (
    <div style={{ padding: '14px 14px 24px', height: '100%' }}>

      {/* ПОИСК */}
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
            type="text" placeholder="Сорт, ферма…" value={search}
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

      {/* ПОДКАТЕГОРИЯ — аккордеон */}
      <Group>
        <GroupLabel text="Подкатегория" />
        <AccordionSubcats products={products} />
      </Group>

      {/* НАЛИЧИЕ */}
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

      {/* ── CUT ── */}
      {category === 'cut' && (
        <>
          <Group>
            <GroupLabel text="Цвет" />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '4px 4px 0' }}>
              {COLORS.map(c => (
                <div
                  key={c.key}
                  onClick={() => toggleColor(c.key)}
                  title={c.label}
                  style={{
                    width: 20, height: 20, borderRadius: '50%', cursor: 'pointer', flexShrink: 0,
                    background: ('gradient' in c ? c.gradient : c.bg) as string,
                    border: `1.5px solid ${'border' in c ? c.border : '#E0E0E0'}`,
                    outline: colors.includes(c.key) ? '2px solid var(--accent)' : 'none',
                    outlineOffset: 2,
                  }}
                />
              ))}
            </div>
          </Group>

          <Group>
            <GroupLabel text="Длина стебля" />
            {LENGTHS.map(l => (
              <CheckRow key={l} checked={lengths.includes(l)}
                label={l >= 80 ? '80+ см' : `${l} см`}
                onChange={() => toggleLength(l)} />
            ))}
          </Group>

          <Group>
            <GroupLabel text="Источник" />
            {ORIGINS.map(o => (
              <CheckRow key={o} checked={origins.includes(o)} label={o} onChange={() => toggleOrigin(o)} />
            ))}
          </Group>

          <Group>
            <GroupLabel text="Флористическая роль" />
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', padding: '2px 4px 0' }}>
              {FLORAL_ROLES.map(r => {
                const on = floralRoles.includes(r.id)
                return (
                  <button key={r.id} onClick={() => toggleFloralRole(r.id)} title={r.label} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 3,
                    padding: '3px 8px', borderRadius: 12,
                    fontSize: 11, fontWeight: 500, fontFamily: 'inherit',
                    background: on ? 'var(--accent)' : '#fff',
                    border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                    color: on ? '#fff' : 'var(--text-mid)',
                    cursor: 'pointer',
                  }}>
                    <span>{r.icon}</span>{r.label}
                  </button>
                )
              })}
            </div>
          </Group>

          <Group>
            <GroupLabel text="Стойкость" />
            {DURATIONS.map(d => (
              <CheckRow key={d.id} checked={durations.includes(d.id)} label={d.label} onChange={() => toggleDuration(d.id)} />
            ))}
          </Group>

          <Group>
            <GroupLabel text="Сезон" />
            {SEASONS.map(s => (
              <CheckRow key={s.id} checked={seasons.includes(s.id)} label={s.label} onChange={() => toggleSeason(s.id)} />
            ))}
          </Group>

          <Group>
            <GroupLabel text="Теги" />
            <TagChips tagDefs={TAGS_CUT} active={tags} onToggle={toggleTag} />
          </Group>
        </>
      )}

      {/* ── POT ── */}
      {category === 'pot' && (
        <>
          <Group>
            <GroupLabel text="Размер горшка" />
            {POT_SIZES.map(ps => (
              <CheckRow key={ps.id} checked={potSizes.includes(ps.id)}
                label={ps.label} onChange={() => togglePotSize(ps.id)} />
            ))}
          </Group>

          <Group>
            <GroupLabel text="Теги" />
            <TagChips tagDefs={TAGS_POT} active={tags} onToggle={toggleTag} />
          </Group>
        </>
      )}

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

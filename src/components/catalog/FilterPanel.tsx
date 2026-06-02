'use client'

import { useMemo, useState, useEffect } from 'react'
import { useFilters } from '@/lib/filter-store'
import { COLORS } from '@/lib/colors'
import { type Product, getAvailable } from './ProductCard'
import { ORIGIN_LABELS } from '@/lib/filter-chips'

// ── category tree ─────────────────────────────────────────────────────────────

type VarietyChild = { label: string; varietyType: string }
type SubcatLeaf   = { label: string; key: string; children?: VarietyChild[] }
type SubcatGroup  = { label: string; isGroup: true; items: SubcatNode[] }
type SubcatNode   = SubcatLeaf | SubcatGroup

function isGroup(n: SubcatNode): n is SubcatGroup { return (n as SubcatGroup).isGroup === true }

const CATEGORY_TREE: Record<string, SubcatNode[]> = {
  cut: [
    { label: 'Розы', key: 'roses', children: [
      { label: 'Одноголовые', varietyType: 'single'     },
      { label: 'Кустовые',    varietyType: 'spray'      },
      { label: 'Пионовидные', varietyType: 'decorative' },
    ]},
    { label: 'Хризантемы', key: 'chrysanthemums', children: [
      { label: 'Одноголовые', varietyType: 'single'  },
      { label: 'Кустовые',    varietyType: 'spray'   },
      { label: 'Помпонные',   varietyType: 'pompom'  },
      { label: 'Сантини',     varietyType: 'santini' },
    ]},
    { label: 'Гвоздики', key: 'carnations', children: [
      { label: 'Одноголовые', varietyType: 'single' },
      { label: 'Кустовые',    varietyType: 'spray'  },
    ]},
    { label: 'Тюльпаны',     key: 'tulips'       },
    { label: 'Пионы',        key: 'peonies'      },
    { label: 'Ранункулюсы',  key: 'ranunculus'   },
    { label: 'Анемоны',      key: 'anemones'     },
    { label: 'Лилии',        key: 'lilies'       },
    { label: 'Герберы',      key: 'gerberas'     },
    { label: 'Эустомы',      key: 'lisianthus'   },
    { label: 'Альстромерии', key: 'alstroemeria' },
    { label: 'Гортензии',    key: 'hydrangeas'   },
    { label: 'Орхидеи',      key: 'orchids'      },
    { label: 'Каллы',        key: 'callas'       },
    { label: 'Антуриумы',    key: 'anthuriums'   },
    { label: 'Протеи',       key: 'proteas'      },
    { label: 'Подсолнухи',   key: 'sunflowers'   },
    { label: 'Ирисы',        key: 'irises'       },
    { label: 'Дельфиниумы',  key: 'delphiniums'  },
    { label: 'Фрезия',       key: 'freesia'      },
    { label: 'Астры',        key: 'asters'       },
    { label: 'Антирринум',   key: 'antirrhinum'  },
    { label: 'Маттиола',     key: 'matthiola'    },
    { label: 'Бувардия',     key: 'bouvardia'    },
    { label: 'Астильба',     key: 'astilbe'      },
    { label: 'Аллиум',       key: 'allium'       },
    { label: 'Целозия',      key: 'celosia'      },
    { label: 'Кампанула',    key: 'campanula'    },
    { label: 'Душистый горошек', key: 'lathyrus' },
    { label: 'Хамелауциум',  key: 'waxflower'    },
    { label: 'Эрингиум',     key: 'eryngium'     },
    { label: 'Георгин',      key: 'dahlia'       },
    { label: 'Зелень',       key: 'greens'       },
    { label: 'Ветки',        key: 'branches'     },
    { label: 'Наполнители',  key: 'fillers'      },
    { label: 'Текстурные',   key: 'texture'      },
    { label: 'Ягоды',        key: 'berries'      },
    { label: 'Лианы',        key: 'vines'        },
    // legacy — показываются если есть товары с этими ключами в БД
    { label: 'Акцентные',    key: 'accents'      },
    { label: 'Сезонные',     key: 'seasonal'     },
    { label: 'Весенние',     key: 'spring'       },
    { label: 'Экзотика',     key: 'exotic'       },
  ],
  pot: [
    { label: 'Комнатные растения', isGroup: true as const, items: [
      { label: 'Цветущие комнатные', isGroup: true as const, items: [
        { label: 'Антуриум',            key: 'anthuriums'         },
        { label: 'Бегония',             key: 'begonias'           },
        { label: 'Луковичные',          key: 'bulbs_indoor'       },
        { label: 'Бромелиевые',         key: 'bromeliads'         },
        { label: 'Хризантемы горшечные',key: 'chrysanthemums_pot' },
        { label: 'Цикламен',            key: 'cyclamen'           },
        { label: 'Пуансеттия',          key: 'poinsettia'         },
        { label: 'Гортензия комнатная', key: 'hydrangeas_indoor'  },
        { label: 'Каланхоэ',            key: 'kalanchoe'          },
        { label: 'Орхидеи',             key: 'orchids'            },
        { label: 'Азалия комнатная',    key: 'azalea_indoor'      },
        { label: 'Розы комнатные',      key: 'roses_indoor'       },
        { label: 'Спатифиллум',         key: 'spathiphyllum'      },
        { label: 'Хищные растения',     key: 'carnivorous'        },
        { label: 'Цветущие прочие',     key: 'flowering'          },
      ]},
      { label: 'Декоративно-лиственные', isGroup: true as const, items: [
        { label: 'Кактусы',             key: 'cacti'              },
        { label: 'Калатея',             key: 'calathea'           },
        { label: 'Драцена',             key: 'dracaena'           },
        { label: 'Фикусы',              key: 'ficus'              },
        { label: 'Крупнолистные',       key: 'large_leaved'       },
        { label: 'Плющ комнатный',      key: 'hedera'             },
        { label: 'Пальмы',              key: 'palms'              },
        { label: 'Суккуленты',          key: 'succulents'         },
        { label: 'Полисциас',           key: 'polyscias'          },
        { label: 'Пахира',              key: 'pachira'            },
        { label: 'Юкка',                key: 'yucca'              },
        { label: 'Папоротники',         key: 'ferns'              },
        { label: 'Замиокулькас',        key: 'zamioculcas'        },
        { label: 'Зелёные прочие',      key: 'green'              },
        { label: 'Крупномеры',          key: 'large'              },
      ]},
    ]},
    { label: 'Садовые растения', isGroup: true as const, items: [
      { label: 'Многолетние', isGroup: true as const, items: [
        { label: 'Морозник',            key: 'helleborus'         },
        { label: 'Лаванда',             key: 'lavender_plant'     },
        { label: 'Декоративные травы',  key: 'ornamental_grasses' },
        { label: 'Водные растения',     key: 'aquatic'            },
        { label: 'Многолетние прочие',  key: 'perennials'         },
      ]},
      { label: 'Огородные культуры', isGroup: true as const, items: [
        { label: 'Плодовые',            key: 'fruit_plants'       },
        { label: 'Овощные',             key: 'vegetables'         },
        { label: 'Пряные травы',        key: 'herbs'              },
      ]},
      { label: 'Кустарники и деревья', isGroup: true as const, items: [
        { label: 'Деревья',             key: 'trees'              },
        { label: 'Самшит',              key: 'buxus'              },
        { label: 'Вереск',              key: 'heather'            },
        { label: 'Эрика',               key: 'erica'              },
        { label: 'Хвойные',             key: 'conifers'           },
        { label: 'Гаультерия',          key: 'gaultheria'         },
        { label: 'Живая изгородь',      key: 'hedging'            },
        { label: 'Хебе',                key: 'hebe'               },
        { label: 'Плющ садовый',        key: 'hedera_outdoor'     },
        { label: 'Гортензия садовая',   key: 'hydrangeas_outdoor' },
        { label: 'Вьющиеся',            key: 'climbing_plants'    },
        { label: 'Рододендроны',        key: 'rhododendrons'      },
        { label: 'Азалии садовые',      key: 'azalea_outdoor'     },
        { label: 'Розы садовые',        key: 'roses_outdoor'      },
        { label: 'Скиммия',             key: 'skimmia'            },
        { label: 'Кустарники прочие',   key: 'outdoor'            },
      ]},
      { label: 'Клумбовые и сезонные', isGroup: true as const, items: [
        { label: 'Фуксия',              key: 'fuchsia'            },
        { label: 'Герань',              key: 'geranium'           },
        { label: 'Виола',               key: 'viola'              },
        { label: 'Анютины глазки',      key: 'pansy'              },
        { label: 'Растения для патио',  key: 'patio_plants'       },
        { label: 'Клумбовые прочие',    key: 'bedding'            },
      ]},
    ]},
    { label: 'Композиции',              key: 'compositions'       },
  ],
  accessories: [
    { label: 'Упаковка флористическая',    key: 'packaging'  },
    { label: 'Горшки, кашпо и фонтаны',   key: 'pots'       },
    { label: 'Грунты и удобрения', isGroup: true as const, items: [
      { label: 'Грунты и субстраты', key: 'soil'        },
      { label: 'Удобрения',          key: 'fertilizers' },
    ]},
    { label: 'Газоны и укрывной материал', key: 'lawns'      },
    { label: 'Сад и огород',               key: 'garden'     },
    { label: 'Искусственные растения',     key: 'artificial' },
    { label: 'Игрушки',                    key: 'toys'       },
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
  { id: 'hit',     label: '🔥 Хит'      },
  { id: 'sale',    label: '🏷 Акция'    },
  { id: 'new',     label: '🆕 Новинка'  },
  { id: 'premium', label: '⭐ Премиум'  },
  { id: 'wedding', label: '💍 Свадебные'},
  { id: 'exotic',  label: '🌿 Экзотика' },
  { id: 'seasonal',label: '🌸 Сезонные' },
  { id: 'spring',  label: '🌷 Весна'    },
]
const TAGS_POT = [
  { id: 'hit',     label: '🔥 Хит'     },
  { id: 'new',     label: '🆕 Новинка' },
  { id: 'premium', label: '⭐ Премиум' },
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
  length: false, origin: false, farm: false,
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
  const { category, subcat, varietyType, setSubcat, setVarietyType, setSubcatAndVT, facets } = useFilters()
  const [openItem,   setOpenItem]   = useState('')
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set())

  // When category changes: reset leaf open state + default-open top-level pot groups
  useEffect(() => {
    setOpenItem('')
    if (category === 'pot') {
      setOpenGroups(new Set(
        (CATEGORY_TREE.pot ?? []).filter(isGroup).map(n => n.label)
      ))
    } else {
      setOpenGroups(new Set())
    }
  }, [category])

  // Auto-open selected subcat to show variety types; also open its parent groups
  useEffect(() => {
    if (!subcat) return
    setOpenItem(subcat)
    // Open all ancestor groups containing this subcat
    const toOpen: string[] = []
    const findAncestors = (nodes: SubcatNode[], path: string[]): boolean => {
      for (const n of nodes) {
        if (isGroup(n)) {
          if (findAncestors(n.items, [...path, n.label])) {
            toOpen.push(...path, n.label)
            return true
          }
        } else if (n.key === subcat) {
          return true
        }
      }
      return false
    }
    findAncestors(CATEGORY_TREE[category] ?? [], [])
    if (toOpen.length) setOpenGroups(prev => new Set([...prev, ...toOpen]))
  }, [subcat, category])

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

  const nodeHasStock = (node: SubcatNode): boolean => {
    if (isGroup(node)) return node.items.some(nodeHasStock)
    return (facets?.subcatCounts?.[node.key] ?? bySC[node.key] ?? 0) > 0 || subcat === node.key
  }

  const toggleGroup = (label: string) =>
    setOpenGroups(prev => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label); else next.add(label)
      return next
    })

  const handleParent = (node: SubcatLeaf) => {
    if (node.children?.length) setOpenItem(prev => prev === node.key ? '' : node.key)
    setSubcat(node.key)
    setVarietyType('')
  }

  const handleChild = (parentKey: string, child: VarietyChild) => {
    setSubcatAndVT(parentKey, child.varietyType)
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

  const renderNode = (node: SubcatNode, depth = 0): React.ReactNode => {
    if (isGroup(node)) {
      if (!node.items.some(nodeHasStock)) return null
      const open = openGroups.has(node.label)
      return (
        <div key={node.label}>
          <button
            onClick={() => toggleGroup(node.label)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 6,
              padding: `5px ${4 + depth * 8}px`,
              background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            <Chevron open={open} />
            <span style={{
              flex: 1, textAlign: 'left',
              fontSize: depth === 0 ? 11 : 10,
              fontWeight: 600,
              color: depth === 0 ? 'var(--text)' : '#b9aab1',
              letterSpacing: depth > 0 ? '0.08em' : undefined,
              textTransform: depth > 0 ? 'uppercase' : undefined,
            }}>
              {node.label}
            </span>
          </button>
          {open && (
            <div style={{ paddingLeft: depth === 0 ? 4 : 10 }}>
              {node.items.map(item => renderNode(item, depth + 1))}
            </div>
          )}
        </div>
      )
    }

    const count = facets?.subcatCounts?.[node.key] ?? bySC[node.key] ?? 0
    if (count === 0 && subcat !== node.key) return null

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
            background: parentSel ? 'var(--accent)' : hasActiveCh ? 'var(--bg2)' : undefined,
            color: parentSel ? '#fff' : 'var(--text)',
            fontWeight: parentSel ? 600 : 400,
          }}
        >
          {hasChildren && <Chevron open={isOpen} />}
          <span style={{ flex: 1 }}>{node.label}</span>
          {countBadge(count, parentSel)}
        </div>

        {hasChildren && isOpen && node.children!
          .filter(child => (byVT[node.key]?.[child.varietyType] ?? 0) > 0)
          .map(child => {
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
          })
        }
      </div>
    )
  }

  return (
    <div>
      {(CATEGORY_TREE[category] ?? []).map(node => renderNode(node))}
    </div>
  )
}

// ── main ──────────────────────────────────────────────────────────────────────

export default function FilterPanel({ products }: { products: Product[] }) {
  const {
    category, subcat, varietyType,
    colors, lengths, origins, farms, potSizes, tags,
    seasons, onlyAvailable, facets,
    setSubcat, setVarietyType,
    toggleColor, toggleLength, toggleOrigin, toggleFarm, togglePotSize, toggleTag,
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
      if (farms.length > 0)       next.farm      = true
      if (seasons.length > 0)     next.season    = true
      if (tags.length > 0)        next.tags      = true
      if (potSizes.length > 0)    next.potSize   = true
      if (subcat)                 next.subcat    = true
      return next
    })
  }, [lengths, origins, farms, seasons, tags, potSizes, subcat])

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
                const count = facets?.colorCounts?.[c.key] ?? null
                const dimmed = facets !== null && !selected && (count ?? 0) === 0
                return (
                  <div
                    key={c.key}
                    onClick={() => !dimmed && toggleColor(c.key)}
                    title={c.label}
                    style={{
                      width: 20, height: 20, borderRadius: '50%',
                      cursor: dimmed ? 'default' : 'pointer', flexShrink: 0,
                      background: ('gradient' in c ? c.gradient : c.bg) as string,
                      border: `1.5px solid ${'border' in c ? c.border : '#E0E0E0'}`,
                      boxShadow: c.key === 'white' ? 'inset 0 0 0 1px #c8c8c8' : 'none',
                      outline: selected ? '2px solid var(--accent)' : 'none',
                      outlineOffset: 2,
                      opacity: dimmed ? 0.25 : 1,
                      transition: 'opacity 0.2s',
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

            {facets && Object.keys(facets.farmCounts ?? {}).length > 0 && (
              <CollapsibleGroup
                label="Производитель"
                open={openGroups.farm}
                onToggle={() => tog('farm')}
                activeCount={farms.length}
              >
                {Object.entries(facets.farmCounts)
                  .sort((a, b) => b[1] - a[1])
                  .map(([name, count]) => {
                    const dimmed = (count ?? 0) === 0 && !farms.includes(name)
                    return (
                      <label
                        key={name}
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
                          type="checkbox" checked={farms.includes(name)}
                          onChange={() => !dimmed && toggleFarm(name)}
                          disabled={dimmed}
                          style={{ width: 14, height: 14, accentColor: 'var(--accent)', cursor: dimmed ? 'default' : 'pointer' }}
                        />
                        <span style={{ flex: 1 }}>{name}</span>
                        <span style={{ fontSize: 10, color: 'var(--text-mid)' }}>{count}</span>
                      </label>
                    )
                  })
                }
              </CollapsibleGroup>
            )}

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

          </>
        )}

        {/* Хит продаж / Акция */}
        <div style={{ display: 'flex', gap: 6, marginTop: 10, marginBottom: 4 }}>
          {([
            { id: 'hit',  label: '🔥 Хит продаж' },
            { id: 'sale', label: '🏷 Акция'       },
          ] as const).map(opt => {
            const on = tags.includes(opt.id)
            return (
              <button
                key={opt.id}
                onClick={() => toggleTag(opt.id)}
                style={{
                  flex: 1, height: 32, border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius-btn)', fontSize: 12, fontWeight: on ? 600 : 400,
                  background: on ? 'var(--accent-light)' : 'var(--bg2)',
                  color: on ? 'var(--accent)' : 'var(--text-mid)',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >{opt.label}</button>
            )
          })}
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

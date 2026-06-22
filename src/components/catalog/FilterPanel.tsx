'use client'

import { useMemo, useState, useEffect } from 'react'
import { useFilters } from '@/lib/filter-store'
import { COLORS, colorSwatch, colorLabel, isLightSwatch, isNonColor, normalizeColor } from '@/lib/colors'
import { type Product, getAvailable } from './ProductCard'
import { ORIGIN_LABELS } from '@/lib/filter-chips'
import { CATEGORY_TREE as ACCESSORIES_TREE, leafForSubcat } from '@/lib/category-tree'

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
  // accessories — рендерится отдельно из category-tree.ts (см. AccessoriesLeaves)
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
  season: false, tags: false, potSize: false, volume: false,
  supplier: true, material: true, potColor: false, accVolume: false,
}

// Порядок подгрупп по подкатегории (data-driven subgroup tabs)
const SUBGROUP_ORDER: Record<string, string[]> = {
  decor:            ['Зоокашпо', 'Статуэтки и фигуры', 'Посуда', 'Сувениры', 'Деревянные изделия'],
  paper:            ['Крафт', 'Жатая', 'Калька', 'Атлас', 'Гофрированная', 'Двухсторонняя', 'Рисовая', 'Прочая'],
  plant_protection: ['Инсектициды', 'Фунгициды', 'Гербициды', 'Родентициды'],
  garden_care:      ['Раскислители'],
}

// Диапазоны объёма (горшки/кашпо/грунты)
const VOLUME_RANGES = [
  { id: 'до5',   label: 'до 5 л',   test: (v: number) => v <= 5 },
  { id: '5-15',  label: '5–15 л',   test: (v: number) => v > 5 && v <= 15 },
  { id: '15-40', label: '15–40 л',  test: (v: number) => v > 15 && v <= 40 },
  { id: '40+',   label: '40+ л',    test: (v: number) => v > 40 },
]
const VOLUME_SUBCATS = new Set(['pots', 'kashpo', 'soil'])

// Порядок диапазонов объёма для accessories-фасета (синхронно с api/facets и ProductGrid)
const ACC_VOLUME_ORDER = ['до 1л', '1-3л', '3-6л', '6-12л', '12+л']

// Строки чекбоксов для accessories-фасета (Производитель/Материал/Цвет/Объём)
function FacetCheckList({ entries, selected, onToggle, labelFor, swatch }: {
  entries: [string, number][]; selected: string[]; onToggle: (v: string) => void
  labelFor?: (v: string) => string; swatch?: boolean
}) {
  return (
    <>
      {entries.map(([val, count]) => (
        <label key={val} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '5px 8px', fontSize: 12,
          borderRadius: 'var(--radius-btn)', cursor: 'pointer',
        }}>
          <input
            type="checkbox" checked={selected.includes(val)} onChange={() => onToggle(val)}
            style={{ width: 14, height: 14, accentColor: 'var(--accent)', cursor: 'pointer' }}
          />
          {swatch && (
            <span style={{
              width: 13, height: 13, borderRadius: '50%', flexShrink: 0,
              background: colorSwatch(val),
              border: `1px solid ${isLightSwatch(val) ? '#D0D0D0' : 'rgba(0,0,0,0.12)'}`,
            }} />
          )}
          <span style={{ flex: 1 }}>{labelFor ? labelFor(val) : val}</span>
          <span style={{ fontSize: 10, color: 'var(--text-mid)' }}>{count}</span>
        </label>
      ))}
    </>
  )
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

  const nodeCount = (node: SubcatNode): number => {
    if (isGroup(node)) return node.items.reduce((s, n) => s + nodeCount(n), 0)
    return facets?.subcatCounts?.[node.key] ?? bySC[node.key] ?? 0
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
      const total = nodeCount(node)
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
            {!open && total > 0 && countBadge(total, false)}
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
          className={parentSel || hasActiveCh ? '' : 'hover:bg-white'}
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
                className={childActive ? '' : 'hover:bg-white'}
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

// ── accessories: мульти-выбор листьев из category-tree.ts ─────────────────────

// Цвет раздела (маркер у заголовка группы) — как в мокапе Каталог.html
const GROUP_COLORS: Record<string, string> = {
  packaging: '#D26AA0', pots: '#C45A38', vases: '#B0822E',
  decor: '#8A57B8', garden: '#5A9E3A', lawn: '#2E9E8F',
}

function AccessoriesLeaves({ products }: { products: Product[] }) {
  const { group, selectedLeaves, toggleLeaf, facets } = useFilters()
  const allMode = group === 'all'  // «Все» — мультивыбор листьев сразу по всем разделам

  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set(ACCESSORIES_TREE.map(g => g.id)))
  const toggleGroup = (id: string) =>
    setOpenGroups(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })

  // Клиентский фолбэк: счётчики по leaf.slug (агрегируя members), если facets ещё нет
  const bySlug = useMemo(() => {
    const m: Record<string, number> = {}
    products.forEach(p => {
      if (getAvailable(p.stock) <= 0) return
      const leaf = leafForSubcat(p.subcategory)
      if (leaf) m[leaf.slug] = (m[leaf.slug] || 0) + 1
    })
    return m
  }, [products])

  const leafCount = (slug: string) => facets?.subcatCounts?.[slug] ?? bySlug[slug] ?? 0

  const countBadge = (count: number, active: boolean) => (
    <span style={{
      fontSize: 10, padding: '2px 7px', borderRadius: 10, fontWeight: 500,
      flexShrink: 0, marginLeft: 'auto',
      background: active ? 'rgba(255,255,255,0.22)' : 'var(--bg2)',
      color: active ? '#fff' : 'var(--text-mid)',
    }}>{count}</span>
  )

  const rowBase: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '5px 8px', fontSize: 12,
    borderRadius: 'var(--radius-btn)', marginBottom: 1,
    cursor: 'pointer', transition: 'background 0.12s',
  }

  type Lf = typeof ACCESSORIES_TREE[number]['leaves'][number]
  const renderLeaf = (leaf: Lf) => {
    const checked = selectedLeaves.includes(leaf.slug)
    return (
      <div
        key={leaf.slug}
        onClick={() => toggleLeaf(leaf.slug)}
        className="hover:bg-white"
        style={{
          ...rowBase,
          color: checked ? 'var(--accent)' : 'var(--text-mid)',
          fontWeight: checked ? 600 : 400,
        }}
      >
        <span style={{
          width: 17, height: 17, borderRadius: 5, flexShrink: 0,
          border: `1.5px solid ${checked ? 'var(--accent)' : 'var(--border)'}`,
          background: checked ? 'var(--accent)' : '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {checked && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
        </span>
        <span style={{ flex: 1 }}>{leaf.label}</span>
        <span style={{ fontFamily: 'var(--font-jetbrains, monospace)', fontSize: 11, color: checked ? 'var(--accent-mid)' : 'var(--text-mid)' }}>{leafCount(leaf.slug)}</span>
      </div>
    )
  }

  // выбранные — вверх, затем разделитель, затем остальные
  const renderList = (leaves: Lf[]) => {
    const selected = leaves.filter(l => selectedLeaves.includes(l.slug))
    const unselected = leaves.filter(l => !selectedLeaves.includes(l.slug))
    return (
      <>
        {selected.map(renderLeaf)}
        {selected.length > 0 && unselected.length > 0 && (
          <div style={{ height: 1, background: 'var(--border)', margin: '6px 8px' }} />
        )}
        {unselected.map(renderLeaf)}
      </>
    )
  }

  // Лист показываем ⟺ count>0 (или выбран).
  const visibleOf = (g: typeof ACCESSORIES_TREE[number]) =>
    g.leaves.filter(l => leafCount(l.slug) > 0 || selectedLeaves.includes(l.slug))

  // Один раздел — плоский список листьев
  if (!allMode) {
    const g = ACCESSORIES_TREE.find(x => x.id === group) ?? ACCESSORIES_TREE[0]
    const leaves = visibleOf(g)
    if (leaves.length === 0) {
      return <div style={{ fontSize: 12, color: 'var(--text-mid)', padding: '4px 8px' }}>Нет позиций в наличии</div>
    }
    return <div>{renderList(leaves)}</div>
  }

  // «Все» — группы аккордеонами, выбор можно сочетать по нескольким разделам
  return (
    <div>
      {ACCESSORIES_TREE.map(g => {
        const leaves = visibleOf(g)
        if (leaves.length === 0) return null
        const open = openGroups.has(g.id)
        const total = leaves.reduce((s, l) => s + leafCount(l.slug), 0)
        return (
          <div key={g.id}>
            <button
              onClick={() => toggleGroup(g.id)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 6,
                padding: '5px 4px', background: 'none', border: 'none',
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              <Chevron open={open} />
              <span style={{ flex: 1, textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: GROUP_COLORS[g.id] ?? 'var(--accent)', flexShrink: 0 }} />
                {g.label}
              </span>
              {!open && total > 0 && countBadge(total, false)}
            </button>
            {open && <div style={{ paddingLeft: 4 }}>{renderList(leaves)}</div>}
          </div>
        )
      })}
    </div>
  )
}

// ── main ──────────────────────────────────────────────────────────────────────

export default function FilterPanel({ products }: { products: Product[] }) {
  const {
    category, subcat, varietyType, selectedLeaves, subgroup,
    colors, lengths, origins, farms, potSizes, volumeRanges, tags,
    suppliers, materials, potColors, volumes,
    seasons, onlyAvailable, facets,
    setSubcat, setVarietyType, setSubgroup, clearLeaves,
    toggleColor, toggleLength, toggleOrigin, toggleFarm, togglePotSize, toggleVolumeRange,
    toggleSupplier, toggleMaterial, togglePotColor, toggleVolume,
    toggleSeason, reset, loadFacets,
  } = useFilters()

  // accessories-фасеты: записи для рендера (Производитель/Материал — по убыванию count; Объём — фикс. порядок)
  const supplierEntries = useMemo<[string, number][]>(
    () => Object.entries(facets?.supplierCounts ?? {}).sort((a, b) => b[1] - a[1]), [facets])
  const materialEntries = useMemo<[string, number][]>(
    () => Object.entries(facets?.materialCounts ?? {}).sort((a, b) => b[1] - a[1]), [facets])
  const potColorEntries = useMemo<[string, number][]>(
    () => Object.entries(facets?.potColorCounts ?? {}).sort((a, b) => b[1] - a[1]), [facets])
  const volumeEntries = useMemo<[string, number][]>(
    () => ACC_VOLUME_ORDER.filter(r => facets?.volumeCounts?.[r]).map(r => [r, facets!.volumeCounts[r]] as [string, number]), [facets])

  // Data-driven subgroup tabs: compute available subgroups for current subcat
  const availableSubgroups = useMemo(() => {
    if (!subcat) return []
    const seen = new Set<string>()
    products.forEach(p => {
      if (p.subcategory === subcat && (p as any).subgroup) seen.add((p as any).subgroup as string)
    })
    const order = SUBGROUP_ORDER[subcat] ?? []
    const inOrder = order.filter(sg => seen.has(sg))
    const rest = [...seen].filter(sg => !order.includes(sg)).sort()
    return [...inOrder, ...rest]
  }, [products, subcat])

  // Фильтр цвета для листа film (Плёнка): токены и counts считаем клиентски из products,
  // скоупом по листу (facets по листьям не считаются). colors[] у film — русские токены.
  const showFilmColors = category === 'accessories' && selectedLeaves.includes('film')
  const filmColors = useMemo<[string, number][]>(() => {
    if (!showFilmColors) return []
    const counts = new Map<string, number>()
    for (const p of products) {
      if (leafForSubcat(p.subcategory)?.slug !== 'film') continue
      if (onlyAvailable && getAvailable(p.stock) <= 0) continue
      // Группировка по нормализованному цвету: «Крем 02»+«крем» = один пункт,
      // не-цвета (н/д, с рисунком) выкидываем. Один товар не считаем дважды за канон.
      const seen = new Set<string>()
      for (const c of p.colors ?? []) {
        if (!c?.trim() || isNonColor(c)) continue
        const canon = normalizeColor(c)
        if (seen.has(canon)) continue
        seen.add(canon)
        counts.set(canon, (counts.get(canon) ?? 0) + 1)
      }
    }
    return [...counts.entries()].sort(
      (a, b) => b[1] - a[1] || colorLabel(a[0]).localeCompare(colorLabel(b[0]), 'ru'),
    )
  }, [products, showFilmColors, onlyAvailable])

  const [openGroups, setOpenGroups] = useState({ ...DEFAULT_OPEN })

  // Recalculate facets when structural filters change (not colors — standard faceting behavior).
  // accessories-фасеты включены в пересчёт → кросс-фасетные counts + скоуп по листьям.
  useEffect(() => { loadFacets() }, [
    category, subcat, varietyType, subgroup, volumeRanges, onlyAvailable,
    selectedLeaves, suppliers, materials, potColors, volumes,
  ])

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
      if (potSizes.length > 0)      next.potSize   = true
      if (volumeRanges.length > 0)  next.volume    = true
      if (suppliers.length > 0)     next.supplier  = true
      if (materials.length > 0)     next.material  = true
      if (potColors.length > 0)     next.potColor  = true
      if (volumes.length > 0)       next.accVolume = true
      if (subcat)                   next.subcat    = true
      return next
    })
  }, [lengths, origins, farms, seasons, tags, potSizes, volumeRanges, suppliers, materials, potColors, volumes, subcat])

  const tog = (key: keyof typeof DEFAULT_OPEN) =>
    setOpenGroups(prev => ({ ...prev, [key]: !prev[key] }))

  const subcatActiveCount = category === 'accessories'
    ? selectedLeaves.length
    : (subcat ? (varietyType ? 2 : 1) : 0)

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

        {/* ЦВЕТ — лист film (Плёнка): русские токены из products, count=0 просто не показываются */}
        {showFilmColors && filmColors.length > 0 && (
          <StaticGroup label="Цвет">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '4px 4px 0' }}>
              {filmColors.map(([token, count]) => {
                const selected = colors.includes(token)
                return (
                  <div
                    key={token}
                    onClick={() => toggleColor(token)}
                    title={`${colorLabel(token)} (${count})`}
                    style={{
                      width: 20, height: 20, borderRadius: '50%',
                      cursor: 'pointer', flexShrink: 0,
                      background: colorSwatch(token),
                      border: `1.5px solid ${isLightSwatch(token) ? '#D0D0D0' : 'rgba(0,0,0,0.12)'}`,
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

        {/* 3. ПОДКАТЕГОРИЯ */}
        <CollapsibleGroup
          label="Подкатегория"
          open={openGroups.subcat}
          onToggle={() => {
            tog('subcat')
            if (category === 'accessories') clearLeaves()
            else { setSubcat(''); setVarietyType('') }
          }}
          activeCount={subcatActiveCount}
        >
          {category === 'accessories'
            ? <AccessoriesLeaves products={products} />
            : <AccordionSubcats products={products} />}
        </CollapsibleGroup>

        {/* Субвкладки по subgroup (data-driven: decor, paper, plant_protection, …) */}
        {availableSubgroups.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
              textTransform: 'uppercase', color: '#b9aab1', padding: '5px 4px 6px',
            }}>Тип</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {['', ...availableSubgroups].map(sg => {
                const active = subgroup === sg
                return (
                  <button key={sg || '__all__'} onClick={() => setSubgroup(sg)} style={{
                    display: 'flex', alignItems: 'center',
                    padding: '5px 8px', fontSize: 12,
                    borderRadius: 'var(--radius-btn)', marginBottom: 1,
                    cursor: 'pointer', border: 'none', fontFamily: 'inherit',
                    background: active ? 'var(--accent)' : 'transparent',
                    color: active ? '#fff' : 'var(--text)',
                    fontWeight: active ? 600 : 400, textAlign: 'left',
                  }}>
                    {sg || 'Все'}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Accessories-фасеты: Производитель · Материал · Объём · Цвет (И-логика) */}
        {category === 'accessories' && (
          <>
            {(supplierEntries.length > 0 || suppliers.length > 0) && (
              <CollapsibleGroup
                label="Производитель"
                open={openGroups.supplier}
                onToggle={() => tog('supplier')}
                activeCount={suppliers.length}
              >
                <FacetCheckList entries={supplierEntries} selected={suppliers} onToggle={toggleSupplier} />
              </CollapsibleGroup>
            )}

            {(materialEntries.length > 0 || materials.length > 0) && (
              <CollapsibleGroup
                label="Материал"
                open={openGroups.material}
                onToggle={() => tog('material')}
                activeCount={materials.length}
              >
                <FacetCheckList entries={materialEntries} selected={materials} onToggle={toggleMaterial} />
              </CollapsibleGroup>
            )}

            {(volumeEntries.length > 0 || volumes.length > 0) && (
              <CollapsibleGroup
                label="Объём"
                open={openGroups.accVolume}
                onToggle={() => tog('accVolume')}
                activeCount={volumes.length}
              >
                <FacetCheckList entries={volumeEntries} selected={volumes} onToggle={toggleVolume} />
              </CollapsibleGroup>
            )}

            {(potColorEntries.length > 0 || potColors.length > 0) && (
              <CollapsibleGroup
                label="Цвет"
                open={openGroups.potColor}
                onToggle={() => tog('potColor')}
                activeCount={potColors.length}
              >
                <FacetCheckList entries={potColorEntries} selected={potColors} onToggle={togglePotColor} labelFor={colorLabel} swatch />
              </CollapsibleGroup>
            )}
          </>
        )}

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

        {/* Объём, л — ЛЕГАСИ-блок (грубые 5–40+ л) для cut/pot-каталога.
            В accessories объём обслуживает новый фасет «Объём» выше — иначе показались
            бы два блока разом (баг проявлялся при «Назад» с карточки горшка: goToSubcat
            ставит subcat='pots', активируя VOLUME_SUBCATS). Поэтому скрываем для accessories. */}
        {category !== 'accessories' && VOLUME_SUBCATS.has(subcat) && (
          <CollapsibleGroup
            label="Объём, л"
            open={openGroups.volume}
            onToggle={() => tog('volume')}
            activeCount={volumeRanges.length}
          >
            {VOLUME_RANGES.map(r => (
              <CheckRow key={r.id} checked={volumeRanges.includes(r.id)}
                label={r.label} onChange={() => toggleVolumeRange(r.id)} />
            ))}
          </CollapsibleGroup>
        )}

        {/* Теги «Хит продаж / Акция» временно убраны из фильтров */}

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

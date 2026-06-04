'use client'
import { useFilters } from '@/lib/filter-store'
import { useProductsStore } from '@/lib/products-store'

const CAT_LABEL: Record<string, string> = {
  accessories: 'Уход · Упаковка · Декор',
  cut:  'Срезанные цветы',
  pot:  'Горшечные растения',
  all:  'Каталог',
}

const SUBCAT_LABEL: Record<string, string> = {
  film: 'Плёнка', paper: 'Бумага', film_bags: 'Пакеты', ribbon: 'Лента и банты',
  organza: 'Органза', mesh: 'Сетка', tissue: 'Тишью', felt: 'Фетр',
  jute: 'Джут и шпагат', bags: 'Сумки', napkins: 'Салфетки',
  paints: 'Краски и спреи', foamiran: 'Фоамиран',
  gift_boxes: 'Подарочные коробки', floral_foam: 'Флор. пена / Оазис',
  tools: 'Инструмент', cards_toppers: 'Открытки и топперы', fillers: 'Наполнители',
  pots: 'Горшки', kashpo: 'Кашпо', fountains: 'Фонтаны', vases: 'Вазы',
  decor: 'Декор и сувениры', baskets: 'Корзины',
  soil: 'Грунты', fertilizers: 'Удобрения', plant_protection: 'Защита растений',
  growth_stim: 'Стимуляторы роста', garden_care: 'Садовый уход', freshcut: 'Уход за срезкой',
  cover_fabric: 'Укрывной материал', cover_film: 'Плёнка полиэтиленовая',
  artificial_grass: 'Искусственный газон', grass_seed: 'Семена газона',
  garden: 'Сад и огород', artificial: 'Искусственные растения', toys: 'Игрушки',
  dried: 'Сухоцветы',
  roses: 'Розы', chrysanthemums: 'Хризантемы', carnations: 'Гвоздики',
  tulips: 'Тюльпаны', peonies: 'Пионы', lilies: 'Лилии', gerberas: 'Герберы',
  hydrangeas: 'Гортензии', orchids: 'Орхидеи', lisianthus: 'Эустомы',
  alstroemeria: 'Альстромерии', greens: 'Зелень',
  flowering: 'Цветущие', succulents: 'Суккуленты', cacti: 'Кактусы',
  palms: 'Пальмы', ficus: 'Фикусы', dracaena: 'Драцена',
}

export default function CtxBar() {
  const { category, subcat } = useFilters()
  const { filteredCount } = useProductsStore()

  const catLabel    = CAT_LABEL[category] ?? 'Каталог'
  const subcatLabel = subcat ? (SUBCAT_LABEL[subcat] ?? subcat) : null
  const h1          = subcatLabel ?? catLabel

  const today   = new Date()
  const updated = `${String(today.getDate()).padStart(2,'0')}.${String(today.getMonth()+1).padStart(2,'0')}`

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '11px 18px',
      background: 'var(--bg-app, #F6F2EF)',
      borderBottom: '1px solid var(--border-soft, #EFEAE5)',
      flexShrink: 0, minHeight: 44,
    }}>
      {/* breadcrumb — скрыт на мобиле если занимает место */}
      {subcatLabel && (
        <span style={{ fontSize: 11, color: 'var(--ink-3, #7A7780)', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {catLabel} /
        </span>
      )}

      {/* H1 */}
      <h1 style={{
        fontFamily: 'var(--font-golos)',
        fontWeight: 700, fontSize: 20,
        letterSpacing: '-0.015em',
        color: 'var(--ink, #1A1A1F)',
        lineHeight: 1, margin: 0, flexShrink: 0,
      }}>
        {h1}
      </h1>

      {/* счётчик — единственное место */}
      <span style={{
        marginLeft: 'auto',
        fontFamily: 'var(--font-jetbrains, monospace)',
        fontSize: 11, color: 'var(--ink-3, #7A7780)',
        whiteSpace: 'nowrap', flexShrink: 0,
      }}>
        <b style={{ color: 'var(--accent, #8B3A5A)', fontWeight: 600 }}>{filteredCount}</b>
        {' '}поз. · {updated}
      </span>
    </div>
  )
}

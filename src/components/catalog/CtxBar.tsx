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
  // accessories
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
  // cut
  roses: 'Розы', chrysanthemums: 'Хризантемы', carnations: 'Гвоздики',
  tulips: 'Тюльпаны', peonies: 'Пионы', lilies: 'Лилии', gerberas: 'Герберы',
  hydrangeas: 'Гортензии', orchids: 'Орхидеи', lisianthus: 'Эустомы',
  alstroemeria: 'Альстромерии', greens: 'Зелень',
  // pot
  flowering: 'Цветущие', succulents: 'Суккуленты', cacti: 'Кактусы',
  palms: 'Пальмы', ficus: 'Фикусы', dracaena: 'Драцена',
}

export default function CtxBar() {
  const { category, subcat } = useFilters()
  const { filteredCount } = useProductsStore()

  const catLabel  = CAT_LABEL[category] ?? 'Каталог'
  const subcatLabel = subcat ? (SUBCAT_LABEL[subcat] ?? subcat) : null
  const h1 = subcatLabel ?? catLabel

  const today = new Date()
  const updated = `${String(today.getDate()).padStart(2,'0')}.${String(today.getMonth()+1).padStart(2,'0')}`

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
      gap: 24, padding: '18px 28px 14px',
      background: 'var(--bg-app, #F6F2EF)',
      borderBottom: '1px solid var(--border-soft, #EFEAE5)',
      flexShrink: 0,
    }}>
      <div>
        {/* breadcrumbs */}
        <div style={{
          fontSize: 12, color: 'var(--ink-3, #7A7780)',
          marginBottom: 5, lineHeight: 1,
        }}>
          Каталог
          {subcatLabel && (
            <> / <span>{catLabel}</span> / </>
          )}
          {!subcatLabel && category !== 'all' && <> / </>}
        </div>
        {/* H1 */}
        <h1 style={{
          fontFamily: 'var(--font-playfair, serif)',
          fontWeight: 400, fontSize: 'clamp(18px, 2.5vw, 26px)',
          letterSpacing: '-0.01em',
          color: 'var(--ink, #1A1A1F)',
          lineHeight: 1.1, margin: 0,
        }}>
          {h1}
        </h1>
      </div>

      {/* meta */}
      <div style={{
        fontFamily: 'var(--font-jetbrains, monospace)',
        fontSize: 11, color: 'var(--ink-3, #7A7780)',
        whiteSpace: 'nowrap', flexShrink: 0,
      }}>
        <span style={{ color: 'var(--accent, #8B3A5A)', fontWeight: 600 }}>
          {filteredCount}
        </span>
        {' '}позиций · обновлено {updated}
      </div>
    </div>
  )
}

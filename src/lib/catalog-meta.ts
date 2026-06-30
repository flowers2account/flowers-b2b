// Резолвер раздела каталога для динамических OG/SEO-метатегов.
// Читает активные фильтры из searchParams (?category/&group/&leaves/&q) — те же ключи,
// что синхронизирует CatalogLayout — и отдаёт человекочитаемые title/description + способ
// выбрать представительные товары для og-картинки. БЕЗ обращений к БД (быстро на каждом рендере).

import {
  GROUP_BY_ID,
  LEAF_BY_SLUG,
  slugsForGroup,
  membersForLeaves,
} from './category-tree'

export type CatalogParams = {
  category?: string
  group?: string
  leaves?: string
  q?: string
  search?: string
}

// Как выбрать товары-«обложки» для og-картинки.
export type PickSpec = { category?: 'cut' | 'pot' | 'accessories'; subcats?: string[]; q?: string }

export type CatalogSection = {
  key: string          // стабильный идентификатор раздела (для отладки/кеша)
  h1: string           // короткий заголовок раздела
  title: string        // SEO/OG-заголовок без бренда («… оптом»)
  description: string   // meta/OG-описание
  pick: PickSpec
}

const BRAND = 'Цветы Уральска'
const TAIL_KZ = 'доставка по Казахстану'
const TAIL_AKT = 'доставка в Актобе и Атырау'

type Copy = { h1: string; title: string; description: string }

const GENERAL: Copy = {
  h1: 'Оптовый каталог для флористов',
  title: 'Оптовый каталог цветов и флористики',
  description: `Свежая срезка, горшечные растения, упаковка, ленты, грунты и инструмент — живые остатки склада онлайн. Опт в Уральске, ${TAIL_KZ}.`,
}

const ACCESSORIES_ROOT: Copy = {
  h1: 'Расходники и упаковка',
  title: 'Расходные материалы и упаковка для флористов оптом',
  description: `Плёнка, бумага, ленты, коробки, грунты, удобрения, горшки и инструмент — всё для цветочного магазина. Живые остатки склада, ${TAIL_KZ}.`,
}

const CUT: Copy = {
  h1: 'Срезанные цветы',
  title: 'Срезанные цветы оптом',
  description: `Розы, хризантемы, тюльпаны, лилии, гвоздики и зелень — свежая срезка по оптовым ценам. Живые остатки склада, ${TAIL_AKT}.`,
}

const POT: Copy = {
  h1: 'Горшечные растения',
  title: 'Горшечные растения оптом',
  description: `Комнатные и цветущие растения в горшках от поставщиков — живые остатки склада онлайн. Опт в Уральске, ${TAIL_KZ}.`,
}

const GROUP_COPY: Record<string, Copy> = {
  packaging: { h1: 'Упаковка и флористика', title: 'Упаковка для цветов оптом',
    description: `Плёнка, бумага, пакеты, коробки, ленты и краски для флористики — десятки видов, живые остатки склада. ${TAIL_AKT}.` },
  pots: { h1: 'Горшки и кашпо', title: 'Горшки и кашпо оптом',
    description: `Горшки и декоративные кашпо разных размеров и материалов — живые остатки склада онлайн. Опт в Уральске, ${TAIL_KZ}.` },
  vases: { h1: 'Вазы и корзины', title: 'Вазы и флористические корзины оптом',
    description: `Стеклянные вазы и плетёные корзины для букетов и композиций — живые остатки склада. ${TAIL_KZ}.` },
  decor: { h1: 'Декор и подарки', title: 'Флористический декор и подарки оптом',
    description: 'Декор, сувениры, искусственные растения, игрушки и фонтаны для оформления — живые остатки склада онлайн.' },
  garden: { h1: 'Сад и огород', title: 'Грунты, удобрения и средства защиты оптом',
    description: 'Грунты, удобрения, стимуляторы роста и средства защиты растений — фасовки от поставщиков, живые остатки склада.' },
  lawn: { h1: 'Газоны и укрытие', title: 'Газон, укрывной материал и плёнка оптом',
    description: 'Искусственный газон, укрывной материал и полиэтиленовая плёнка в погонных метрах — живые остатки склада.' },
}

const LEAF_COPY: Record<string, Copy> = {
  film: { h1: 'Плёнка для цветов', title: 'Упаковочная плёнка для цветов оптом',
    description: `Плёнка для цветов: матовая, прозрачная и цветная — десятки видов, живые остатки склада онлайн, ${TAIL_AKT}.` },
  paper: { h1: 'Флористическая бумага', title: 'Крафт и флористическая бумага оптом',
    description: `Крафт, тишью, калька и дизайнерская бумага для упаковки букетов — живые остатки склада. ${TAIL_KZ}.` },
  film_bags: { h1: 'Пакеты и сумки', title: 'Пакеты для цветов и подарков оптом',
    description: 'Пакеты и сумки для букетов и подарков — разные размеры и дизайны, живые остатки склада онлайн.' },
  gift_boxes: { h1: 'Подарочные коробки', title: 'Подарочные и шляпные коробки оптом',
    description: `Шляпные коробки, наборы и подарочная упаковка для цветов — живые остатки склада. ${TAIL_KZ}.` },
  paints: { h1: 'Краски и спреи', title: 'Краски и спреи для флористики оптом',
    description: 'Аэрозольные краски, спреи и блёстки для тонирования цветов и декора — живые остатки склада онлайн.' },
  pots: { h1: 'Горшки', title: 'Цветочные горшки оптом',
    description: 'Горшки разных размеров и материалов для растений и рассады — живые остатки склада. Опт в Уральске.' },
  kashpo: { h1: 'Кашпо', title: 'Декоративные кашпо оптом',
    description: 'Декоративные кашпо для интерьера и подарков — разные формы и материалы, живые остатки склада онлайн.' },
  vases: { h1: 'Вазы', title: 'Вазы для цветов оптом',
    description: `Стеклянные и декоративные вазы для букетов и витрины — живые остатки склада. ${TAIL_KZ}.` },
  baskets: { h1: 'Корзины', title: 'Флористические корзины оптом',
    description: 'Плетёные корзины для букетов и композиций, в комплектах и поштучно — живые остатки склада онлайн.' },
  soil: { h1: 'Грунты', title: 'Грунты и субстраты оптом',
    description: `Грунты, торф и субстраты в разных фасовках для растений и рассады — живые остатки склада. ${TAIL_KZ}.` },
  fertilizers: { h1: 'Удобрения', title: 'Удобрения и стимуляторы роста оптом',
    description: 'Минеральные и органические удобрения, стимуляторы роста — фасовки от поставщиков, живые остатки склада онлайн.' },
  plant_protection: { h1: 'Защита растений', title: 'Средства защиты растений оптом',
    description: `Инсектициды, фунгициды и средства защиты растений — живые остатки склада. ${TAIL_KZ}.` },
  garden_care: { h1: 'Садовый уход', title: 'Садовый инвентарь и уход оптом',
    description: 'Инструмент, средства ухода и подкормки для сада и срезки — живые остатки склада онлайн.' },
  decor: { h1: 'Декор и сувениры', title: 'Флористический декор и сувениры оптом',
    description: 'Декор, сувениры и сухоцветы для оформления букетов и витрин — живые остатки склада онлайн.' },
  toys: { h1: 'Игрушки', title: 'Мягкие игрушки для букетов оптом',
    description: `Мягкие игрушки для букетов и подарков — живые остатки склада. ${TAIL_KZ}.` },
  artificial: { h1: 'Искусственные растения', title: 'Искусственные цветы и растения оптом',
    description: `Искусственные цветы, зелень и растения для оформления — живые остатки склада. ${TAIL_KZ}.` },
  fountains: { h1: 'Фонтаны', title: 'Декоративные фонтаны оптом',
    description: 'Декоративные фонтаны для интерьера и подарков — живые остатки склада онлайн.' },
  artificial_grass: { h1: 'Искусственный газон', title: 'Искусственный газон оптом',
    description: `Искусственный газон в погонных метрах для декора и оформления — живые остатки склада. ${TAIL_KZ}.` },
  cover_fabric: { h1: 'Укрывной материал', title: 'Укрывной материал (спанбонд) оптом',
    description: 'Укрывной материал и агроволокно в погонных метрах — живые остатки склада онлайн.' },
  cover_film: { h1: 'Плёнка полиэтиленовая', title: 'Полиэтиленовая плёнка оптом',
    description: `Полиэтиленовая и парниковая плёнка в погонных метрах — живые остатки склада. ${TAIL_KZ}.` },
}

function parseLeaves(raw?: string): string[] {
  return (raw ?? '').split(',').map(s => s.trim()).filter(Boolean).filter(s => LEAF_BY_SLUG.has(s))
}

function leafFallbackCopy(slug: string): Copy {
  const label = LEAF_BY_SLUG.get(slug)?.label ?? slug
  return {
    h1: label,
    title: `${label} оптом`,
    description: `${label} для флористов — живые остатки склада онлайн. Опт в Уральске, ${TAIL_KZ}.`,
  }
}

/** Раздел каталога по активным фильтрам (для метатегов и og-картинки). */
export function resolveCatalogSection(p: CatalogParams): CatalogSection {
  const q = (p.q ?? p.search ?? '').trim()
  if (q) {
    return {
      key: `q:${q.toLowerCase()}`,
      h1: `«${q}»`,
      title: `${q} — поиск в каталоге`,
      description: `Результаты по запросу «${q}» в каталоге «${BRAND}»: живые остатки склада онлайн, опт и ${TAIL_KZ}.`,
      pick: { q },
    }
  }

  const category = p.category
  const leaves = parseLeaves(p.leaves)

  if (category === 'accessories') {
    // Конкретный лист (один) — самый точный раздел.
    if (leaves.length === 1) {
      const slug = leaves[0]
      const copy = LEAF_COPY[slug] ?? leafFallbackCopy(slug)
      return { key: `leaf:${slug}`, ...copy, pick: { category: 'accessories', subcats: membersForLeaves([slug]) } }
    }
    // Несколько листьев — раздел группы + перечень.
    if (leaves.length > 1) {
      const labels = leaves.map(s => LEAF_BY_SLUG.get(s)?.label ?? s)
      const base = (p.group && GROUP_COPY[p.group]) ? GROUP_COPY[p.group] : ACCESSORIES_ROOT
      return {
        key: `leaves:${leaves.join(',')}`,
        h1: base.h1,
        title: `${labels.join(', ')} оптом`,
        description: `${labels.join(', ')} — живые остатки склада онлайн. Опт в Уральске, ${TAIL_KZ}.`,
        pick: { category: 'accessories', subcats: membersForLeaves(leaves) },
      }
    }
    // Группа без уточнения листьев.
    if (p.group && p.group !== 'all' && GROUP_BY_ID.has(p.group)) {
      const copy = GROUP_COPY[p.group] ?? ACCESSORIES_ROOT
      return { key: `group:${p.group}`, ...copy, pick: { category: 'accessories', subcats: membersForLeaves(slugsForGroup(p.group)) } }
    }
    // Корень аксессуаров.
    return { key: 'accessories', ...ACCESSORIES_ROOT, pick: { category: 'accessories' } }
  }

  if (category === 'cut')  return { key: 'cut', ...CUT, pick: { category: 'cut' } }
  if (category === 'pot')  return { key: 'pot', ...POT, pick: { category: 'pot' } }

  // Корень каталога / неизвестные параметры.
  return { key: 'catalog', ...GENERAL, pick: {} }
}

/** Сборка query-строки og-картинки из тех же параметров (стабильный порядок). */
export function ogImageQuery(p: CatalogParams): string {
  const sp = new URLSearchParams()
  const q = (p.q ?? p.search ?? '').trim()
  if (q) { sp.set('q', q); return sp.toString() }
  if (p.category) sp.set('category', p.category)
  if (p.group) sp.set('group', p.group)
  const leaves = parseLeaves(p.leaves)
  if (leaves.length) sp.set('leaves', leaves.join(','))
  return sp.toString()
}

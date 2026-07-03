// Источник истины таксономии accessories. Дерево агрегирует существующие
// products.subcategory через members[]. Миграции данных нет. Сироты → скрытое
// "Прочее" (показывать только при остатке). Единицы: products.unit → leaf.unit → 'шт'.

export type Leaf = { slug: string; label: string; members: string[]; unit?: string; variant?: string; hidden?: boolean }
export type Group = { id: string; label: string; leaves: Leaf[] }

// Лейбл пилюли категории accessories в шапке (единственное место правды).
export const ACCESSORIES_LABEL = '📦 Уход · Упаковка · Декор'
export const ACCESSORIES_LABEL_SHORT = '📦 Уход · Упак. · Декор'

export const CATEGORY_TREE: Group[] = [
  { id: 'packaging', label: 'Упаковка и флористика', leaves: [
    { slug: 'film',          label: 'Плёнка',              members: ['film'], unit: 'пог. м' },
    { slug: 'paper',         label: 'Бумага',              members: ['paper'] },
    { slug: 'tissue',        label: 'Тишью',               members: ['tissue'] },
    { slug: 'film_bags',     label: 'Пакеты',              members: ['film_bags','bags'] },
    { slug: 'gift_boxes',    label: 'Подарочные коробки',  members: ['gift_boxes'] },
    { slug: 'ribbon',        label: 'Ленты',               members: ['ribbon','organza'] },
    { slug: 'napkins',       label: 'Салфетки',            members: ['napkins'] },
    { slug: 'cards_toppers', label: 'Открытки и вставки',  members: ['cards_toppers'] },
    { slug: 'paints',        label: 'Краски и спреи',      members: ['paints'] },
    { slug: 'floral_foam',   label: 'Оазис (флор. пена)',  members: ['floral_foam'] },
    { slug: 'jute',          label: 'Джут и бечёвка',      members: ['jute'] },
    { slug: 'mesh',          label: 'Сетка',               members: ['mesh'] },
    { slug: 'tools',         label: 'Инструменты',         members: ['tools'] },
    { slug: 'pkg_other',     label: 'Прочее', hidden: true,
        members: ['floristry_items','felt','fillers','foamiran'] },
  ]},
  { id: 'pots', label: 'Горшки и кашпо', leaves: [
    { slug: 'pots',       label: 'Горшки', members: ['pots'] },
    { slug: 'kashpo',     label: 'Кашпо',  members: ['kashpo'] },
    { slug: 'pots_other', label: 'Прочее', hidden: true, members: ['pots_accessories'] },
  ]},
  { id: 'vases', label: 'Вазы и корзины', leaves: [
    { slug: 'vases',   label: 'Вазы',    members: ['vases'] },
    { slug: 'baskets', label: 'Корзины', members: ['baskets'], variant: 'Комплектность' },
  ]},
  { id: 'decor', label: 'Декор и подарки', leaves: [
    { slug: 'decor',      label: 'Декор и сувениры',       members: ['decor','lanterns','dried'] },
    { slug: 'toys',       label: 'Игрушки',                members: ['toys'] },
    { slug: 'artificial', label: 'Искусственные растения', members: ['artificial','artificial_flowers'] },
    { slug: 'fountains',  label: 'Фонтаны',                members: ['fountains'] },
  ]},
  { id: 'garden', label: 'Сад и огород', leaves: [
    { slug: 'soil',             label: 'Грунты',          members: ['soil'],                     variant: 'Фасовка' },
    { slug: 'fertilizers',      label: 'Удобрения',       members: ['fertilizers','growth_stim'], variant: 'Фасовка' },
    { slug: 'plant_protection', label: 'Защита растений', members: ['plant_protection'],         variant: 'Объём' },
    { slug: 'garden_care',      label: 'Садовый уход',    members: ['garden_care','garden','freshcut'] },
  ]},
  { id: 'lawn', label: 'Газоны и укрытие', leaves: [
    { slug: 'artificial_grass', label: 'Искусственный газон',   members: ['artificial_grass'], unit: 'пог. м' },
    { slug: 'cover_fabric',     label: 'Укрывной материал',     members: ['cover_fabric'],     unit: 'пог. м' },
    { slug: 'cover_film',       label: 'Плёнка полиэтиленовая', members: ['cover_film'],       unit: 'пог. м' },
    { slug: 'lawn_other',       label: 'Прочее', hidden: true,  members: ['grass_seed'] },
  ]},
]

// ── derived index: rawSubcat → Leaf (единственный обратный индекс по members) ──
export const LEAF_BY_RAW_SUBCAT: Map<string, Leaf> = (() => {
  const m = new Map<string, Leaf>()
  for (const group of CATEGORY_TREE) {
    for (const leaf of group.leaves) {
      for (const raw of leaf.members) m.set(raw, leaf)
    }
  }
  return m
})()

// ── derived index: leaf.slug → Leaf (для мульти-выбора по slug листа) ─────────
export const LEAF_BY_SLUG: Map<string, Leaf> = new Map(
  CATEGORY_TREE.flatMap(g => g.leaves.map(l => [l.slug, l] as const)),
)

// ── группы (раздел = контекст сайдбара/товаров) ───────────────────────────────
export const GROUP_BY_ID: Map<string, Group> = new Map(CATEGORY_TREE.map(g => [g.id, g] as const))
export const DEFAULT_GROUP_ID = CATEGORY_TREE[0].id

/** Слаги листьев группы (для фильтра «весь раздел»). */
export function slugsForGroup(groupId: string): string[] {
  return (GROUP_BY_ID.get(groupId)?.leaves ?? []).map(l => l.slug)
}

/** id группы, которой принадлежит лист (по leaf.slug). */
export function groupIdForLeafSlug(slug: string): string | undefined {
  for (const g of CATEGORY_TREE) if (g.leaves.some(l => l.slug === slug)) return g.id
  return undefined
}

/** id группы (раздела) по сырому products.subcategory (или undefined). */
export function groupIdForSubcat(rawSubcat: string | null | undefined): string | undefined {
  const leaf = leafForSubcat(rawSubcat)
  return leaf ? groupIdForLeafSlug(leaf.slug) : undefined
}

/** Лист дерева, к которому принадлежит сырой products.subcategory (или undefined). */
export function leafForSubcat(rawSubcat: string | null | undefined): Leaf | undefined {
  if (!rawSubcat) return undefined
  return LEAF_BY_RAW_SUBCAT.get(rawSubcat)
}

/** RU-лейбл листа по его slug (для чипов выбранных листьев). */
export function labelForLeafSlug(slug: string): string {
  return LEAF_BY_SLUG.get(slug)?.label ?? slug
}

/** Объединение members выбранных листьев (для WHERE subcategory IN (...)). */
export function membersForLeaves(slugs: Iterable<string>): string[] {
  const out: string[] = []
  for (const s of slugs) {
    const leaf = LEAF_BY_SLUG.get(s)
    if (leaf) out.push(...leaf.members)
  }
  return out
}

/** true, если сырой subcat товара попадает в один из выбранных листьев. */
export function subcatInLeaves(rawSubcat: string | null | undefined, slugs: string[]): boolean {
  if (slugs.length === 0) return true
  const leaf = leafForSubcat(rawSubcat)
  return !!leaf && slugs.includes(leaf.slug)
}

/** Лейбл «варианта» на карточке (Фасовка/Размер/…); fallback — 'Вариант'. */
export function variantLabelForSubcat(rawSubcat: string | null | undefined): string {
  return leafForSubcat(rawSubcat)?.variant ?? 'Вариант'
}

/** RU-лейбл листа; fallback — сам slug (для cut/pot и неизвестных значений). */
export function labelForSubcat(rawSubcat: string | null | undefined): string {
  if (!rawSubcat) return ''
  return LEAF_BY_RAW_SUBCAT.get(rawSubcat)?.label ?? rawSubcat
}

/** Единица измерения товара: products.unit → leaf.unit → 'шт'. */
export function unitForProduct(
  product: { unit?: string | null; subcategory?: string | null },
): string {
  return product.unit || leafForSubcat(product.subcategory)?.unit || 'шт'
}

// ── build-time integrity: members покрывают ровно 42 slug без пересечений ──────
{
  const all = CATEGORY_TREE.flatMap(g => g.leaves.flatMap(l => l.members))
  const dupes = [...new Set(all.filter((s, i) => all.indexOf(s) !== i))]
  if (dupes.length) {
    throw new Error(`[category-tree] пересечения members между листьями: ${dupes.join(', ')}`)
  }
  if (all.length !== 42) {
    throw new Error(`[category-tree] ожидалось 42 slug в members, получено ${all.length}`)
  }
}

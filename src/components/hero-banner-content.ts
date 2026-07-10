// Контент промо-hero-баннера (главная + каталог). Все тексты и href — здесь,
// чтобы правились в одном месте без вмешательства в вёрстку.

// ──────────────────────────────────────────────────────────────────────────
// ⚠️ TODO(подтвердить у клиента): оффер «Первый заказ через сайт — доставка
// бесплатно» — это НОВОЕ условие сверх двух действующих акций. До подтверждения
// владельцем флаг держим false → баннер показывает действующую акцию
// (бесплатная доставка Актобе/Атырау от 50 000 ₸). После подтверждения —
// поставить true.
// ──────────────────────────────────────────────────────────────────────────
export const OFFER_FIRST_ORDER_FREE_CONFIRMED = false

export type HeroCta = { label: string; href?: string; iconDown?: boolean }

export type HeroContent = {
  eyebrow: string
  title: string
  titleAccent: string
  subtitleHome: string
  subtitleCatalog: string
  fine: string
  ctaHome: HeroCta
  ctaCatalog: HeroCta
}

// Вариант 1 — согласованный оффер «первый заказ бесплатно».
const CONFIRMED: HeroContent = {
  eyebrow: 'Ближайшая доставка • Актобе • Атырау',
  title: 'Первый заказ через сайт —',
  titleAccent: 'доставка бесплатно',
  subtitleHome: 'Выберите товары из актуального наличия и оформите заказ к ближайшей доставке в выходные.',
  subtitleCatalog: 'Соберите заказ из актуального наличия к ближайшей доставке в выходные.',
  fine: 'Предложение действует для первого заказа, оформленного через сайт.',
  ctaHome: { label: 'Перейти в каталог', href: '/catalog' },
  ctaCatalog: { label: 'Смотреть наличие', iconDown: true },
}

// Вариант 2 (fallback, пока оффер не подтверждён) — действующая акция.
const ACTIVE_PROMO: HeroContent = {
  eyebrow: 'Доставка • Актобе • Атырау',
  title: 'Бесплатная доставка в Актобе и Атырау —',
  titleAccent: 'от 50 000 ₸',
  subtitleHome: 'Выберите товары из актуального наличия и оформите заказ к ближайшей доставке в выходные.',
  subtitleCatalog: 'Соберите заказ из актуального наличия к ближайшей доставке в выходные.',
  fine: 'Бесплатная доставка раз в неделю при заказе через сайт от 50 000 ₸.',
  ctaHome: { label: 'Перейти в каталог', href: '/catalog' },
  ctaCatalog: { label: 'Смотреть наличие', iconDown: true },
}

export const HERO = OFFER_FIRST_ORDER_FREE_CONFIRMED ? CONFIRMED : ACTIVE_PROMO

// Плашка маршрута (общая для обеих страниц).
export const HERO_ROUTE = {
  label: 'Ближайший рейс',
  legs: [
    { city: 'Актобе', arrow: false, mid: false },
    { city: 'Уральск', note: 'склад', arrow: true, mid: true },
    { city: 'Атырау', arrow: true, mid: false },
  ],
} as const

// Преимущества под баннером (только главная). Иконки — Lucide (line), не эмодзи.
export type PerkKey = 'assortment' | 'trips' | 'stock' | 'ai'
export const HERO_PERKS: { icon: PerkKey; title: string; sub: string }[] = [
  { icon: 'assortment', title: '900+ товаров', sub: 'упаковка, горшки, декор, сад' },
  { icon: 'trips', title: 'Регулярные рейсы', sub: 'Актобе и Атырау каждую неделю' },
  { icon: 'stock', title: 'Актуальные остатки', sub: 'наличие склада онлайн 24/7' },
  { icon: 'ai', title: 'AI-подбор', sub: 'поможет собрать заказ' },
]

// Якорь для скролла CTA каталога к сетке товаров.
export const CATALOG_GRID_ANCHOR_ID = 'catalog-grid-top'

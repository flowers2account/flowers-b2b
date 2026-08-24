// Реестр кампаний промо-hero-баннера (главная + каталог).
//
// Чтобы запустить новую кампанию — НЕ нужно переписывать вёрстку:
//   1) добавь запись в CAMPAIGNS (тексты, CTA, фото, при желании тему-цвет);
//   2) положи фото в public/images/campaigns/<файл>.webp;
//   3) переключи CURRENT_CAMPAIGN_ID на её id — одной строкой.
//
// Фото можно и просто заменить: перезаписал public/images/campaigns/hero-default.webp
// утром — баннер обновился, разработчик не нужен.

export type HeroCta = { label: string; href?: string; iconDown?: boolean }

// Необязательная тема-цвет для кампании (напр. зелёная к Новому году / 1 сентября).
// Переопределяет акцент баннера; по умолчанию — фирменный бордо #8B3A5A.
export type HeroTheme = { accent?: string; accentDeep?: string }

export type Campaign = {
  id: string
  eyebrow: string
  title: string
  titleAccent: string          // курсивный акцент в заголовке
  subtitleHome: string
  subtitleCatalog: string
  finePrint?: string           // сноска (показывается на главной)
  trustLine?: string           // строка доверия под CTA (обе страницы)
  ctaHome: HeroCta
  ctaCatalog: HeroCta
  image: string                // /images/campaigns/<файл>.webp
  theme?: HeroTheme
}

export const CAMPAIGNS: Record<string, Campaign> = {
  // ▼▼▼ АКТИВНАЯ КАМПАНИЯ (подтверждена владельцем) ▼▼▼
  'first-order-free': {
    id: 'first-order-free',
    eyebrow: 'Ближайшая доставка • Актобе • Атырау',
    title: 'Первый заказ через сайт —',
    titleAccent: 'доставка бесплатно',
    subtitleHome: 'Выберите товары из актуального наличия и оформите заказ к ближайшей доставке в выходные.',
    subtitleCatalog: 'Соберите заказ из актуального наличия к ближайшей доставке в выходные.',
    finePrint: 'Предложение действует для первого заказа, оформленного через сайт.',
    trustLine: 'Актуальные остатки из 1С',
    ctaHome: { label: 'Перейти в каталог', href: '/catalog' },
    ctaCatalog: { label: 'Выбрать товары', iconDown: true },
    image: '/images/campaigns/hero-default.webp',
  },

  // ── Заготовки будущих кампаний (не активны). Добавь фото в campaigns/ и переключи id. ──
  'free-supplies-delivery': {
    id: 'free-supplies-delivery',
    eyebrow: 'Фурнитура для упаковки букетов • Актобе • Атырау',
    title: 'Бесплатная доставка фурнитуры для упаковки букетов —',
    titleAccent: 'от 50 000 ₸',
    subtitleHome: 'Упаковка, оазис, ленты, инструменты — соберите заказ и получите доставку за наш счёт.',
    subtitleCatalog: 'Соберите заказ фурнитуры для упаковки букетов к ближайшей доставке в выходные.',
    finePrint: 'Бесплатная доставка раз в неделю при заказе фурнитуры для упаковки букетов от 50 000 ₸.',
    trustLine: 'Актуальные остатки из 1С',
    ctaHome: { label: 'Перейти в каталог', href: '/catalog' },
    ctaCatalog: { label: 'Выбрать товары', iconDown: true },
    image: '/images/campaigns/hero-delivery.webp',
  },
  'september-1': {
    id: 'september-1',
    eyebrow: 'Подготовка к 1 сентября',
    title: 'Горшечные растения к 1 сентября —',
    titleAccent: 'в наличии на складе',
    subtitleHome: 'Горшечные растения и расходные материалы для флористов — из наличия склада.',
    subtitleCatalog: 'Соберите заказ горшечных растений и фурнитуры для упаковки букетов к 1 сентября.',
    trustLine: 'Актуальные остатки из 1С',
    ctaHome: { label: 'Смотреть каталог', href: '/catalog?category=pot' },
    ctaCatalog: { label: 'Выбрать товары', iconDown: true },
    image: '/images/campaigns/hero-september.webp',
  },
  'new-year': {
    id: 'new-year',
    eyebrow: 'Новогодняя упаковка',
    title: 'Новогодняя упаковка и декор —',
    titleAccent: 'уже на складе',
    subtitleHome: 'Плёнка, ленты, коробки и декор к праздникам — соберите заказ к ближайшей доставке.',
    subtitleCatalog: 'Соберите новогодний заказ из актуального наличия.',
    trustLine: 'Актуальные остатки из 1С',
    ctaHome: { label: 'Перейти в каталог', href: '/catalog' },
    ctaCatalog: { label: 'Выбрать товары', iconDown: true },
    image: '/images/campaigns/hero-flowers.webp',
    theme: { accent: '#2E5640', accentDeep: '#24402F' },
  },
}

// ── Активная кампания — меняется ОДНОЙ строкой ──────────────────────────────
export const CURRENT_CAMPAIGN_ID = 'september-1'
export const CAMPAIGN: Campaign = CAMPAIGNS[CURRENT_CAMPAIGN_ID]

// Плашка маршрута (общая для обеих страниц). Уральск — центральный склад-хаб:
// рейсы расходятся из него вверх (Актобе) и вниз (Атырау).
export const HERO_ROUTE = {
  label: 'Ближайший рейс',
  legs: [
    { city: 'Актобе', arrow: 'up', mid: false },
    { city: 'Уральск', note: 'склад', arrow: 'none', mid: true },
    { city: 'Атырау', arrow: 'down', mid: false },
  ],
} as const

// Преимущества под баннером (только главная). Иконки — Lucide (line), не эмодзи.
// Заголовки без хрупких чисел, чтобы баннер не устаревал при смене остатков.
export type PerkKey = 'assortment' | 'trips' | 'stock' | 'ai'
export const HERO_PERKS: { icon: PerkKey; title: string; sub: string }[] = [
  { icon: 'assortment', title: 'Актуальный ассортимент', sub: 'упаковка, горшки, декор, сад' },
  { icon: 'trips', title: 'Регулярные рейсы', sub: 'Актобе и Атырау каждую неделю' },
  { icon: 'stock', title: 'Актуальные остатки', sub: 'наличие склада онлайн 24/7' },
  { icon: 'ai', title: 'Не знаете, что выбрать?', sub: 'AI поможет подобрать товары' },
]

// Якорь для скролла CTA каталога к сетке товаров.
export const CATALOG_GRID_ANCHOR_ID = 'catalog-grid-top'

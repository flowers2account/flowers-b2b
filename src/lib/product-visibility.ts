// Единый признак «товар показывается на витрине».
//
// Раньше список источников был продублирован литералом в пяти запросах, а блок
// «Похожие» на карточке товара про него вообще не знал — и подмешивал карточки
// oz_catalog, которых в каталоге нет и открыть их оттуда нельзя. Держим в одном
// месте, чтобы витрина и рекомендации не расходились.
//
// uralsk_site / uralsk_1c — товар нашего склада. Всё остальное (waterdrinker,
// oz_catalog, oz_preorder, 1c_manual) — сырьё и спящие бэкапы: они живут в БД,
// но на витрину не выходят, пока их source не переведут в публикуемый.
export const VISIBLE_SOURCES = ['uralsk_site', 'uralsk_1c'] as const

export type VisibleSource = (typeof VISIBLE_SOURCES)[number]

/** Мутабельная копия — PostgREST .in() принимает string[], не readonly-кортеж. */
export const visibleSources = (): string[] => [...VISIBLE_SOURCES]

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

export const isVisibleSource = (s: string | null | undefined): boolean =>
  !!s && (VISIBLE_SOURCES as readonly string[]).includes(s)

// Варианты для админской формы. Первые два публикуемые, остальные — сырьё и
// спящие бэкапы: карточка с таким source на витрину не выходит ни при каком
// is_active. Значения новые не выдумываем — это ровно то, что есть в products.source.
export const SOURCE_OPTIONS: { v: string; l: string }[] = [
  { v: 'uralsk_site',  l: 'Витрина · свой склад' },
  { v: 'uralsk_1c',    l: 'Витрина · из 1С' },
  { v: 'waterdrinker', l: 'Waterdrinker — сырьё, не показывается' },
  { v: 'oz_catalog',   l: 'OZ каталог — спящий бэкап, не показывается' },
  { v: 'oz_preorder',  l: 'OZ предзаказ — не показывается' },
  { v: 'oz_export',    l: 'OZ экспорт — не показывается' },
  { v: '1c_manual',    l: '1С вручную (устаревшее) — не показывается' },
]

/**
 * Почему карточки нет на витрине. Витрина требует три условия разом, и путаница
 * между «активна» и «видна» стоила уже нескольких разборов: карточка с
 * is_active=true и source='waterdrinker' на сайте не появится никогда.
 */
export function visibilityIssues(p: {
  is_active: boolean; source: string | null; qty: number; site_qty?: number | null
}): string[] {
  const out: string[] = []
  if (!p.is_active) out.push('снят флаг «Активен»')
  if (!isVisibleSource(p.source)) out.push(`источник «${p.source ?? '—'}» не публикуется`)
  if (!(p.qty > 0 || (p.site_qty ?? 0) > 0)) out.push('нулевой остаток')
  return out
}

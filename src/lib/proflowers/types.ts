// Ответы market.proflowers.kz (JSON API). Форма — по разведке из TZ-proflowers-integration.md.
// Поля, которых может не быть в выдаче, помечены необязательными: парсер не должен падать
// из-за того, что поставщик не прислал, например, characteristics.

// Цены приходят и строкой ("930"), и числом (930) — приводим к numeric на стороне парсера.
export type PfNumeric = number | string

export interface PfProfileResponse {
  client?: { name?: string }
}

export interface PfActiveTradingDay {
  id: number
  // 'exchange' | 'preorder'; тип не сужаем — новый тип дня не должен ломать разбор
  type: string
  name: string
  dateTimeNormalized?: string
  nomenclatureId?: number
}

export interface PfTradingDaysResponse {
  activeTradingDays: PfActiveTradingDay[]
}

export interface PfListItemTradingDay {
  id: number
  type: string
  date?: string
  normalized_date?: string
  name?: string
  nomenclature_name?: string
  nomenclature_id?: number
}

// Один объект из list[] каталога. id — предложение на торговый день, product_id — сам товар.
export interface PfListItem {
  id: number
  product_id: number
  name: string
  characteristics?: string
  color_name?: string
  country?: { name?: string; id?: number }
  trademark?: string
  height?: PfNumeric
  length?: PfNumeric
  width?: PfNumeric
  diameter?: PfNumeric
  barcode?: string

  // price_with_discount / box_price_with_discount — спеццена аккаунта (закупка)
  price?: PfNumeric
  box_price?: PfNumeric
  price_with_discount: PfNumeric
  box_price_with_discount?: PfNumeric
  is_promotion?: boolean

  count_left?: number
  multiplicity?: number
  box_multiplicity?: number
  is_sold_in_box?: boolean
  is_box_only?: boolean

  trading_day: PfListItemTradingDay

  image_show?: string
  image_small?: string
  photos?: string[]
}

// pages.total — ОБЩЕЕ ЧИСЛО ТОВАРОВ, а не страниц: страниц ceil(total / ipp).
export interface PfCatalogPages {
  total: number
  pg: number
  ipp: number
}

export interface PfCatalogResponse {
  list: PfListItem[]
  pages: PfCatalogPages
  catalogGroups?: unknown
  catalogGroupsFlat?: unknown
  filterForm?: unknown
}

// Строка вьюхи pf_catalog (см. supabase/migrations/20260921120000_proflowers_pf_tables.sql +
// 20260923090000_pf_catalog_box_price.sql). Закупочных цен здесь нет — только client_price/
// box_client_price, уже посчитанные с наценкой на стороне БД.
export type PfCatalogItem = {
  pf_offer_id: number
  name: string
  characteristics: string | null
  color_name: string | null
  country: string | null
  image_url: string | null
  photos: string[] | null
  trading_day_type: string
  trading_day_date: string | null
  count_left: number
  multiplicity: number
  box_multiplicity: number | null
  is_sold_in_box: boolean
  is_box_only: boolean
  client_price: number
  box_client_price: number | null
  // Категория дня — задел под фильтр на витрине (v2, пока не строим UI: сейчас категория
  // одна, «Товары декора»). Схема и прокидка готовы, чтобы включить фильтр без новой миграции.
  nomenclature_id: number | null
  nomenclature_name: string | null
}

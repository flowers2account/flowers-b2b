-- Наценка по категориям (nomenclature) для pf_catalog, с фолбэком на global.
-- Схема pf_markup_rules уже поддерживает scope='category' (scope_ref — текстовое поле),
-- не хватало только: (1) уникального индекса под upsert по категориям, (2) логики выбора
-- правила во вьюхе (сейчас берёт только global).

-- Позволяет upsert по (scope, scope_ref) для category-строк, аналогично тому, как
-- pf_markup_rules_one_active_global_idx уже обеспечивает это для global.
create unique index if not exists pf_markup_rules_category_scope_ref_idx
  on public.pf_markup_rules (scope, scope_ref)
  where scope = 'category' and is_active;

-- LATERAL для наценки: сначала ищем активное category-правило по nomenclature_id товара
-- (scope_ref хранится как text), если нет — берём global. (scope='category') desc в ORDER BY
-- отдаёт предпочтение категорийному правилу перед глобальным, когда оба подходят под WHERE.
create or replace view public.pf_catalog
with (security_invoker = true) as
select
  o.pf_offer_id,
  p.name,
  p.characteristics,
  p.color_name,
  p.country,
  p.image_url,
  p.photos,
  d.type as trading_day_type,
  d.date as trading_day_date,
  o.count_left,
  o.multiplicity,
  o.box_multiplicity,
  o.is_sold_in_box,
  o.is_box_only,
  round(o.purchase_price * (1 + coalesce(m.percent, 0) / 100.0) + coalesce(m.plus_amount, 0)) as client_price,
  round(o.box_purchase_price * (1 + coalesce(m.percent, 0) / 100.0) + coalesce(m.plus_amount, 0)) as box_client_price,
  d.nomenclature_id,
  d.nomenclature_name,
  g.pf_group_id as group_id,
  g.name as group_name
from public.pf_offers o
join public.pf_products p on p.pf_product_id = o.product_id
join public.pf_trading_days d on d.pf_id = o.trading_day_id
left join lateral (
  select r.percent, r.plus_amount
  from public.pf_markup_rules r
  where r.is_active
    and (
      (r.scope = 'category' and r.scope_ref = d.nomenclature_id::text)
      or r.scope = 'global'
    )
  order by (r.scope = 'category') desc, r.id desc
  limit 1
) m on true
left join lateral (
  select cg.pf_group_id, cg.name
  from public.pf_product_groups pg
  join public.pf_catalog_groups cg on cg.pf_group_id = pg.pf_group_id
  where pg.product_id = o.product_id
  order by pg.synced_at desc
  limit 1
) g on true
where o.is_available
  and coalesce(o.count_left, 0) > 0
  and (d.stop_time is null or d.stop_time > now());

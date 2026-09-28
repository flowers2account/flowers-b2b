-- Подкатегория товара в pf_catalog — LEFT JOIN pf_product_groups → pf_catalog_groups, с
-- null-фолбэком: товар, ещё не дообойдённый (или отвалившийся лист), просто не пропадает
-- с витрины, group_id/group_name будут null. pf_product_groups допускает несколько групп на
-- product_id (составной ключ, см. миграцию 20260924100000) — на 25.09.2026 пересечений
-- фактически нет (проверено обходом всех листьев), но на случай появления берём ОДНУ через
-- LATERAL (свежайшую по synced_at), чтобы pf_catalog остался 1 строка на оффер, как сейчас.

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
  where r.scope = 'global' and r.is_active
  order by r.id desc
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

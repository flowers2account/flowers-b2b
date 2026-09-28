-- Добавляет box_client_price во вьюху pf_catalog: цена короба у Proflowers НЕ равна
-- цена_шт × кратность (пример: 300 ₸/шт при box_purchase_price 490 ₸/короб — опт со своей
-- скидкой), поэтому считаем от box_purchase_price отдельно, а не приблизительно на клиенте.
-- Тот же лежащий рядом лейтерал-join m (активное глобальное pf_markup_rules) и то же округление
-- до целого тенге, что у client_price — единица и короб остаются согласованы между собой.
-- box_purchase_price у товаров без коробочной продажи NULL — box_client_price тоже NULL
-- (арифметика и round() с NULL естественно дают NULL, CASE не нужен).
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
  round(o.box_purchase_price * (1 + coalesce(m.percent, 0) / 100.0) + coalesce(m.plus_amount, 0)) as box_client_price
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
where o.is_available and coalesce(o.count_left, 0) > 0;

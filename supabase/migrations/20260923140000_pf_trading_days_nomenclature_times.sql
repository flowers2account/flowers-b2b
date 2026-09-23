-- Задача B (категория) + витрина скрывает закрывшиеся дни (stop_time) + start_time (симметрично,
-- на будущее — витрину по нему пока не фильтруем). is_active чинится отдельно кодом парсера,
-- новых колонок под это не нужно.

-- 1) Категория дня: числовой id (имя уже сохраняется, см. tradingDayRowFromItem в parser.ts)
alter table public.pf_trading_days
  add column if not exists nomenclature_id bigint;

-- 2) Время закрытия и открытия приёма заказов по дню — подтверждено сырым GET /trading-days/
-- (startDateTime/stopDateTime). Есть ТОЛЬКО в /trading-days/, не в list[].trading_day — в
-- парсере это будет писать только стаб-шаг, обычный per-page upsert эти колонки не трогает.
alter table public.pf_trading_days
  add column if not exists stop_time timestamptz;
alter table public.pf_trading_days
  add column if not exists start_time timestamptz;

-- Новые колонки (nomenclature_id, nomenclature_name) — СТРОГО в конце списка: CREATE OR REPLACE
-- VIEW трактует сдвиг позиции существующих колонок как попытку их переименования (42P16),
-- первая попытка этой миграции упала именно на этом (nomenclature_* стояли перед count_left).
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
  d.nomenclature_name
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
where o.is_available
  and coalesce(o.count_left, 0) > 0
  and (d.stop_time is null or d.stop_time > now());

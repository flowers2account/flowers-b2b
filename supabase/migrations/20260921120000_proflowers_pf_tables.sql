-- Proflowers (market.proflowers.kz): товары «под заказ / биржа» у поставщика.
-- Изолировано от основного каталога (products) и синхронизации с 1С: свои таблицы pf_*,
-- внешних ключей на products нет. Пишет только сервис (service-role) из /api/cron/pf-sync.

-- Торговые дни поставщика (exchange | preorder). type без CHECK: новый тип дня не должен
-- ронять синхронизацию.
create table if not exists public.pf_trading_days (
  id bigserial primary key,
  pf_id bigint not null unique,
  type text not null,
  date timestamptz,
  name text,
  nomenclature_name text,
  is_active boolean not null default true,
  synced_at timestamptz not null default now()
);

-- Карточка товара (product_id постоянен между днями).
create table if not exists public.pf_products (
  id bigserial primary key,
  pf_product_id bigint not null unique,
  name text not null,
  characteristics text,
  color_name text,
  country text,
  trademark text,
  height numeric,
  length numeric,
  diameter numeric,
  barcode text,
  image_url text,
  photos jsonb,
  updated_at timestamptz not null default now()
);

-- Предложение на конкретный торговый день: цена + остаток («горячая» таблица).
-- purchase_price — закупка со спецценой аккаунта; клиенту НЕ отдаётся.
create table if not exists public.pf_offers (
  id bigserial primary key,
  pf_offer_id bigint not null unique,
  product_id bigint not null references public.pf_products (pf_product_id),
  trading_day_id bigint not null references public.pf_trading_days (pf_id),
  purchase_price numeric not null,
  box_purchase_price numeric,
  count_left integer,
  multiplicity integer,
  box_multiplicity integer,
  is_sold_in_box boolean,
  is_box_only boolean,
  is_promotion boolean,
  is_available boolean not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists pf_offers_day_available_idx
  on public.pf_offers (trading_day_id, is_available);

create index if not exists pf_offers_product_id_idx
  on public.pf_offers (product_id);

-- Наценка отдельно от цен. Пока используется только scope = 'global'.
create table if not exists public.pf_markup_rules (
  id bigserial primary key,
  scope text not null default 'global' check (scope in ('global', 'category', 'product')),
  scope_ref text,
  percent numeric not null default 0,
  plus_amount numeric not null default 0,
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

-- Не больше одного активного глобального правила: вьюха берёт его однозначно.
create unique index if not exists pf_markup_rules_one_active_global_idx
  on public.pf_markup_rules (scope)
  where scope = 'global' and is_active;

-- Журнал прогонов. 'running' — защита от параллельного запуска, 'success' | 'error' — итог.
create table if not exists public.pf_sync_runs (
  id bigserial primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  trading_day_id bigint,
  trading_day_type text,
  pages_fetched integer,
  offers_upserted integer,
  products_upserted integer,
  marked_unavailable integer,
  status text not null default 'running' check (status in ('running', 'success', 'error')),
  error text
);

-- Глобальная наценка по умолчанию 0 % — значение задаст владелец.
insert into public.pf_markup_rules (scope, percent, plus_amount)
select 'global', 0, 0
where not exists (
  select 1 from public.pf_markup_rules where scope = 'global' and is_active
);

-- Витрина: то, что можно показывать клиенту. Закупочных цен здесь НЕТ.
-- Клиентская цена = закупка + глобальная наценка (считается на лету, поменял percent —
-- витрина пересчиталась). security_invoker: даже если вьюхе случайно выдадут права,
-- RLS базовых таблиц (включён, политик нет) закроет доступ всем, кроме service-role.
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
  round(o.purchase_price * (1 + coalesce(m.percent, 0) / 100.0) + coalesce(m.plus_amount, 0)) as client_price
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

-- Доступ: только service-role (RLS включён без политик + права отозваны).
alter table public.pf_trading_days enable row level security;
alter table public.pf_products enable row level security;
alter table public.pf_offers enable row level security;
alter table public.pf_markup_rules enable row level security;
alter table public.pf_sync_runs enable row level security;

revoke all on public.pf_trading_days from anon, authenticated;
revoke all on public.pf_products from anon, authenticated;
revoke all on public.pf_offers from anon, authenticated;
revoke all on public.pf_markup_rules from anon, authenticated;
revoke all on public.pf_sync_runs from anon, authenticated;
revoke all on public.pf_catalog from anon, authenticated;

revoke all on sequence public.pf_trading_days_id_seq from anon, authenticated;
revoke all on sequence public.pf_products_id_seq from anon, authenticated;
revoke all on sequence public.pf_offers_id_seq from anon, authenticated;
revoke all on sequence public.pf_markup_rules_id_seq from anon, authenticated;
revoke all on sequence public.pf_sync_runs_id_seq from anon, authenticated;

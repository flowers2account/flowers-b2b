-- pf_orders / pf_order_items — заявки с витрины «Под заказ» (Proflowers). Изолированы от
-- orders/order_items (те FK на products.id — INTEGER, здесь pf_offer_id из pf_offers,
-- смешивать нельзя). RLS: deny-all (как остальные pf_*-таблицы) — запись только через
-- service-role в API-роуте /api/pod-zakaz/order.

create table if not exists public.pf_orders (
  id bigserial primary key,
  client_name text not null,
  client_phone text not null,
  client_id uuid references public.clients (id),
  comment text,
  total numeric not null,
  manager_notified boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.pf_order_items (
  id bigserial primary key,
  order_id bigint not null references public.pf_orders (id) on delete cascade,
  pf_offer_id bigint not null references public.pf_offers (pf_offer_id),
  name text not null,
  color_name text,
  is_box_only boolean not null default false,
  qty_steps integer not null check (qty_steps > 0),
  step_units integer not null,
  unit_price numeric not null,
  line_total numeric not null,
  trading_day_date date,
  created_at timestamptz not null default now()
);

alter table public.pf_orders enable row level security;
alter table public.pf_order_items enable row level security;
revoke all on public.pf_orders from anon, authenticated;
revoke all on public.pf_order_items from anon, authenticated;
revoke all on sequence public.pf_orders_id_seq from anon, authenticated;
revoke all on sequence public.pf_order_items_id_seq from anon, authenticated;

-- Избранное (применено как миграция favorites, 2026-06-09).
-- client_id → clients.id (uuid), product_id → products.id (int). unique(client_id,product_id).
-- RLS: пока выключен (как clients/orders) — пишем браузерным клиентом с сессией.
-- TODO security backlog: enable RLS + политика на основе auth.uid()/резолва клиента.
-- Откат: drop table public.favorites;

create table if not exists public.favorites (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients(id) on delete cascade,
  product_id  integer not null references public.products(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (client_id, product_id)
);
create index if not exists favorites_client_id_idx on public.favorites (client_id);

-- Заявки на доступ к магазину (форма на /about). Применено как миграция access_requests (2026-06-08).
-- RLS включён без политик: доступ только через серверный роут /api/access-request (service role).
-- Откат: drop table public.access_requests;

create table if not exists public.access_requests (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  phone       text not null,
  status      text not null default 'new',   -- new → (менеджер обрабатывает)
  created_at  timestamptz not null default now()
);
alter table public.access_requests enable row level security;
create index if not exists access_requests_phone_created_idx
  on public.access_requests (phone, created_at desc);

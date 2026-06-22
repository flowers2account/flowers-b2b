-- Версия B, Такт 1 — фундамент истории диалога AI-виджета.
-- Односторонняя интеграция (память диалога + отражение в amoCRM примечаниями).
-- Двусторонний amoJo-канал — Такт 2 (поля amo_chat_id/amojo_msg_id заложены, но НЕ
-- используются сейчас).
--
-- Доступ: RLS включён, БЕЗ политик → данные только через service-role (как
-- registration_requests). anon/authenticated явно лишены табличных прав.

-- ── conversations ────────────────────────────────────────────────────────────
create table if not exists public.conversations (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid references public.clients(id) on delete set null,  -- залогинен
  anon_id         text,                                                   -- гость (localStorage)
  phone           text,                                                   -- нормализованный (+7…)
  channel         text not null default 'widget',
  -- куда писать примечания в amo (Такт 1): сделка или контакт
  amo_entity_type text,                                                   -- 'contact' | 'lead'
  amo_entity_id   bigint,
  -- задел под amoJo (Такт 2) — пока не используется
  amo_chat_id     text,
  status          text not null default 'open',                          -- 'open' | 'closed'
  last_note_at    timestamptz,                                            -- дедуп примечаний-сводок
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists conversations_client_id_idx on public.conversations (client_id);
create index if not exists conversations_anon_id_idx   on public.conversations (anon_id);
create index if not exists conversations_phone_idx     on public.conversations (phone);

-- ── messages ─────────────────────────────────────────────────────────────────
create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role            text not null check (role in ('user', 'bot', 'manager')),
  text            text,
  products        jsonb,                                                  -- карточки, если были
  delivery_status text not null default 'stored',                        -- задел: stored|sent|delivered|failed
  -- задел под amoJo (Такт 2) — пока не используется
  amojo_msg_id    text,
  created_at      timestamptz not null default now()
);

create index if not exists messages_conversation_id_created_idx
  on public.messages (conversation_id, created_at);

-- ── Безопасность: только service-role ────────────────────────────────────────
alter table public.conversations enable row level security;
alter table public.messages      enable row level security;

-- RLS без политик = anon/authenticated не видят строк; service-role обходит RLS.
-- Плюс явный revoke табличных прав (дефолтный PUBLIC-грант не должен открыть доступ).
revoke all on public.conversations from anon, authenticated;
revoke all on public.messages      from anon, authenticated;

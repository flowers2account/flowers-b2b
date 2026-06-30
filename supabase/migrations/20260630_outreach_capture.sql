-- Захват WhatsApp-аутрича из Umnico в Supabase (зеркало холодной B2B-рассылки
-- флористам, воронка amoCRM «Обзвон LAPS» pipeline 11053958).
--
-- ⚠️ Таблица public.messages занята AI-виджетом сайта — НЕ переиспользуем и НЕ меняем.
-- Это отдельные таблицы только для аутрича.
--
-- Доступ: RLS включён БЕЗ политик → строки видит только service-role (как
-- conversations/messages виджета). anon/authenticated явно лишены прав.
-- Только запись/чтение через сервер. Никакой автоотправки.

-- ── outreach_contacts ─────────────────────────────────────────────────────────
create table if not exists public.outreach_contacts (
  id              uuid primary key default gen_random_uuid(),
  phone           text,                       -- нормализованный +7XXXXXXXXXX (normalizePhone)
  name            text,
  company         text,
  city            text,
  instagram       text,
  amo_lead_id     bigint,                     -- сделка в воронке «Обзвон LAPS» (best-effort линк)
  amo_contact_id  bigint,
  umnico_lead_id  text,                       -- id диалога Umnico — резервный ключ матча без телефона
  status          text not null default 'new',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Партиальные уникальные ключи: один контакт на телефон и на диалог Umnico.
create unique index if not exists outreach_contacts_phone_uniq
  on public.outreach_contacts (phone) where phone is not null;
create unique index if not exists outreach_contacts_umnico_lead_uniq
  on public.outreach_contacts (umnico_lead_id) where umnico_lead_id is not null;
create index if not exists outreach_contacts_amo_lead_idx
  on public.outreach_contacts (amo_lead_id) where amo_lead_id is not null;

-- ── outreach_messages ─────────────────────────────────────────────────────────
create table if not exists public.outreach_messages (
  id                uuid primary key default gen_random_uuid(),
  contact_id        uuid references public.outreach_contacts(id) on delete cascade,
  direction         text not null check (direction in ('in', 'out')),
  text              text,
  channel           text,                     -- sa.type из вебхука (whatsapp2 и т.п.)
  umnico_message_id text,                     -- id сообщения Umnico — ключ идемпотентности
  umnico_lead_id    text,                     -- id диалога Umnico (для группировки)
  sender_user_id    text,                     -- userId отправителя (для исходящих)
  delivery_status   text,                     -- статус доставки, если пришёл
  sent_at           timestamptz,              -- время сообщения из payload, если есть
  raw               jsonb,                    -- сырой payload целиком — на всякий случай
  created_at        timestamptz not null default now()
);

-- Идемпотентность: повторный вебхук с тем же messageId не создаёт дубль.
create unique index if not exists outreach_messages_umnico_msg_uniq
  on public.outreach_messages (umnico_message_id) where umnico_message_id is not null;
create index if not exists outreach_messages_contact_idx
  on public.outreach_messages (contact_id, sent_at);
create index if not exists outreach_messages_lead_idx
  on public.outreach_messages (umnico_lead_id);

-- ── Безопасность: только service-role ─────────────────────────────────────────
alter table public.outreach_contacts enable row level security;
alter table public.outreach_messages enable row level security;

revoke all on public.outreach_contacts from anon, authenticated;
revoke all on public.outreach_messages from anon, authenticated;

-- Гейт диалогов для режима канала 'manual' ИИ-бота Umnico.
-- Бот отвечает в manual-канале только в лидах, явно включённых командой /бот.
create table if not exists public.bot_enabled_leads (
  lead_id    bigint primary key,
  enabled_at timestamptz not null default now(),
  enabled_by text
);

comment on table public.bot_enabled_leads is
  'Лиды Umnico, в которых ИИ-бот включён вручную (режим канала manual). Команда /бот добавляет, /стоп удаляет.';

-- Доступ только сервер-сайд через service role (как остальные bot-таблицы). RLS не открываем для anon.
alter table public.bot_enabled_leads enable row level security;

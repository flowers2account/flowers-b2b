-- Версия B, Такт 1.5 — анонимные обращения виджета в amoCRM.
-- Поверх таблиц conversations/messages (Такт 1, миграция 20260622_widget_conversations.sql).
-- Двусторонний amoJo НЕ трогаем.
--
-- Что добавляем в conversations:
--   amo_pipeline_id    — воронка лида (для обращений = «Обращения с сайта»), отличает
--                        инкуайри-лид от прочих; читается кроном.
--   guest_name         — имя, оставленное анонимом в форме «оставьте телефон» (в clients
--                        его ещё нет — это НЕ полная регистрация).
--   phone_captured     — аноним оставил телефон застрявшего обращения (без PIN).
--   stuck_notified_at  — дедуп крон-уведомления «потенциально потерянный лид».
--
-- amo_entity_type ('leads'|'contacts') / amo_entity_id уже есть в Такте 1 — туда пишем
-- id созданного лида обращения. Дедуп анонимного лида = наличие amo_entity_id.

alter table public.conversations
  add column if not exists amo_pipeline_id   bigint,
  add column if not exists guest_name        text,
  add column if not exists phone_captured     boolean not null default false,
  add column if not exists stuck_notified_at timestamptz;

-- Крон ищет «застрявшие» обращения (есть лид, телефон не оставлен, давно молчат, ещё не
-- уведомляли) и диалоги с новыми сообщениями после last_note_at (досыл сводки).
create index if not exists conversations_amo_entity_idx
  on public.conversations (amo_entity_id) where amo_entity_id is not null;

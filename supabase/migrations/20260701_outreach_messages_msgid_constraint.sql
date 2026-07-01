-- Фикс к 20260630_outreach_capture: PostgREST upsert(onConflict: umnico_message_id)
-- не может использовать ПАРТИАЛЬНЫЙ уникальный индекс как арбитр ON CONFLICT
-- (ошибка «there is no unique or exclusion constraint matching the ON CONFLICT
-- specification»). Из-за этого сообщения не вставлялись (контакты — обычным insert —
-- создавались). Заменяем партиальный индекс на обычный UNIQUE constraint.
-- NULL по умолчанию DISTINCT (PG17) → множество строк без umnico_message_id разрешено.

drop index if exists public.outreach_messages_umnico_msg_uniq;

alter table public.outreach_messages
  add constraint outreach_messages_umnico_msg_uniq unique (umnico_message_id);

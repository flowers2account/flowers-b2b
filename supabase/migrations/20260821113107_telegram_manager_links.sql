-- Связка «сообщение в Telegram-группе менеджеров» ↔ «WhatsApp Cloud API диалог».
-- На каждое сообщение (входящее от клиента / ответ AI), отправленное в группу,
-- пишем строку с telegram-координатами. Reply менеджера на любое из этих сообщений
-- ищется здесь по (telegram_chat_id, telegram_message_id) → chatJid/phone для отправки
-- клиенту и takeover. conversation_id НЕ храним — chatJid/phone достаточно, их резолвит
-- та же логика, что и остальной whatsapp-event pipeline (resolveWhatsAppConversation).
create table if not exists public.telegram_manager_links (
  id                   uuid primary key default gen_random_uuid(),
  telegram_chat_id     bigint not null,
  telegram_message_id  bigint not null,
  chat_jid             text not null,
  phone                text,
  created_at           timestamptz not null default now()
);

create unique index if not exists telegram_manager_links_msg_idx
  on public.telegram_manager_links (telegram_chat_id, telegram_message_id);

create index if not exists telegram_manager_links_chat_jid_idx
  on public.telegram_manager_links (chat_jid);

-- Доступ только через service-role (тот же паттерн, что dispatcher_messages/whatsapp_gateway_outbox).
alter table public.telegram_manager_links enable row level security;
revoke all on public.telegram_manager_links from anon, authenticated;

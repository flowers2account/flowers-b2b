alter table public.conversations
  add column if not exists ai_enabled boolean not null default true,
  add column if not exists takeover_status text not null default 'none',
  add column if not exists takeover_started_at timestamptz,
  add column if not exists takeover_reason text,
  add column if not exists whatsapp_chat_jid text;

create index if not exists conversations_whatsapp_chat_jid_idx
  on public.conversations (whatsapp_chat_jid) where whatsapp_chat_jid is not null;

create index if not exists conversations_phone_idx
  on public.conversations (phone);

create table if not exists public.whatsapp_gateway_outbox (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  conversation_id uuid references public.conversations(id) on delete set null,
  chat_jid text,
  phone text,
  source text not null default 'gateway',
  message_id text,
  status text not null default 'reserved',
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists whatsapp_gateway_outbox_idempotency_key_idx
  on public.whatsapp_gateway_outbox (idempotency_key);

create index if not exists whatsapp_gateway_outbox_conversation_id_idx
  on public.whatsapp_gateway_outbox (conversation_id);

create index if not exists whatsapp_gateway_outbox_message_id_idx
  on public.whatsapp_gateway_outbox (message_id) where message_id is not null;

alter table public.whatsapp_gateway_outbox enable row level security;
revoke all on public.whatsapp_gateway_outbox from anon, authenticated;

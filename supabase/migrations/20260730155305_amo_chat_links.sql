create table if not exists public.amo_chat_links (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations(id) on delete set null,
  phone text,
  whatsapp_chat_jid text,
  amo_scope_id text,
  amo_chat_id text,
  amo_conversation_id text,
  amo_contact_id bigint,
  amo_lead_id bigint,
  last_amo_message_id text,
  last_whatsapp_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists amo_chat_links_whatsapp_chat_jid_idx
  on public.amo_chat_links (whatsapp_chat_jid) where whatsapp_chat_jid is not null;

create unique index if not exists amo_chat_links_amo_chat_id_idx
  on public.amo_chat_links (amo_chat_id) where amo_chat_id is not null;

create unique index if not exists amo_chat_links_amo_conversation_id_idx
  on public.amo_chat_links (amo_conversation_id) where amo_conversation_id is not null;

create index if not exists amo_chat_links_phone_idx
  on public.amo_chat_links (phone) where phone is not null;

create index if not exists amo_chat_links_conversation_id_idx
  on public.amo_chat_links (conversation_id) where conversation_id is not null;

alter table public.amo_chat_links enable row level security;
revoke all on public.amo_chat_links from anon, authenticated;

create table if not exists public.amo_chat_message_dedupe (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  message_key text not null,
  conversation_id uuid references public.conversations(id) on delete set null,
  amo_chat_link_id uuid references public.amo_chat_links(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (source, message_key)
);

create index if not exists amo_chat_message_dedupe_conversation_id_idx
  on public.amo_chat_message_dedupe (conversation_id) where conversation_id is not null;

alter table public.amo_chat_message_dedupe enable row level security;
revoke all on public.amo_chat_message_dedupe from anon, authenticated;

create unique index if not exists messages_amojo_msg_id_idx
  on public.messages (amojo_msg_id) where amojo_msg_id is not null;

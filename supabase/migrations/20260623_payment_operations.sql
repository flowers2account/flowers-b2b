-- Часть 2 экрана «Платежи»: реестр операций банка ePay (POST /operations), read-only.
-- Отдельная таблица, payments не трогаем. Тянется client_credentials-токеном (без кабинета/2FA).
-- Идемпотентность — UNIQUE по банковскому id операции (records[].id).
create table if not exists public.payment_operations (
  id                uuid primary key default gen_random_uuid(),
  epay_operation_id text not null unique,           -- records[].id (UUID банка) — ключ дедупа
  invoice_id        text,                            -- records[].invoiceId = payments.invoice_id
  order_id          int references public.orders(id) on delete set null,  -- через payments по invoice_id; NULL = мимо сайта
  status            text,                            -- CHARGE / REFUND / CANCEL (строка банка)
  amount            numeric,
  org_amount        numeric,
  currency          text,
  reference         text,
  card_mask         text,
  card_type         text,
  issuer            text,
  approval_code     text,
  payer_name        text,
  payer_phone       text,
  payer_email       text,
  created_date      timestamptz,                     -- records[].createdDate
  payout_date       timestamptz,
  payout_amount     numeric,
  source            text not null default 'registry',
  raw               jsonb,                           -- вся запись банка (аудит)
  synced_at         timestamptz not null default now()
);

create index if not exists payment_operations_invoice_id_idx on public.payment_operations (invoice_id);
create index if not exists payment_operations_order_id_idx    on public.payment_operations (order_id);
create index if not exists payment_operations_created_idx     on public.payment_operations (created_date);

-- Доступ только через service-role (экран читает createAdminClient, как и payments).
alter table public.payment_operations enable row level security;
revoke all on public.payment_operations from anon, authenticated;

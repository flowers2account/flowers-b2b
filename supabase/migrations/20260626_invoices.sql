-- Счёт на оплату с QR — счета, сгенерированные на сайте (не из 1С).
-- Нумерация числовая, диапазон с 9000001 (90xxxxx = счёт с сайта, узнаваемо в выписке).
-- Номер выдаётся атомарно из SEQUENCE — один счёт = один номер, без гонки.

-- Последовательность номеров счетов: старт 9000001, минимум не опускается ниже старта.
create sequence if not exists public.invoice_number_seq
  start with 9000001
  increment by 1
  minvalue 9000001
  no cycle;

create table if not exists public.invoices (
  id             uuid primary key default gen_random_uuid(),
  invoice_number bigint not null unique default nextval('public.invoice_number_seq'), -- числовой номер, с 9000001
  order_id       int references public.orders(id) on delete set null,  -- orders.id = int4; NULL = счёт без заказа сайта
  client_id      uuid references public.clients(id) on delete set null,
  amount         numeric not null,
  status         text not null default 'draft'
                   check (status in ('draft','sent','paid','cancelled')),
  pay_method     text check (pay_method in ('qr','transfer')),         -- как клиент выбрал; NULL допустим
  qr_link        text,                                                  -- сгенерированная ссылка applink/b2b
  guid           uuid default gen_random_uuid(),                        -- invoiceId для QR (GUID документа реализации)
  pdf_url        text,                                                  -- путь к PDF
  paid_at        timestamptz,
  paid_source    text check (paid_source in ('onlineduken_api','manual')), -- как подтверждена оплата; NULL допустим
  created_at     timestamptz not null default now()
);

-- Последовательность принадлежит колонке — дропнется вместе с таблицей.
alter sequence public.invoice_number_seq owned by public.invoices.invoice_number;

create index if not exists invoices_order_id_idx  on public.invoices (order_id);
create index if not exists invoices_client_id_idx on public.invoices (client_id);
create index if not exists invoices_status_idx    on public.invoices (status);

-- Доступ только через service-role (как orders/clients/payment_operations). Anon/public отрезаны.
alter table public.invoices enable row level security;
revoke all on public.invoices from anon, authenticated;
revoke all on sequence public.invoice_number_seq from anon, authenticated;

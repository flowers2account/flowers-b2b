-- Этап 1 экрана «Платежи»: раскладываем полезные поля из payments.raw_postlink
-- в колонки для отчётности/сверки. raw_postlink не трогаем (остаётся аудит-сырьём).
-- Только оплаты с сайта (epay postlink). У status='created' raw=NULL → бэкфилл их пропустит.

alter table public.payments
  add column if not exists approval_code text,        -- approvalCode — код авторизации банка
  add column if not exists card_type     text,        -- cardType — платёжная система (VISA/MasterCard)
  add column if not exists issuer         text,        -- issuer — банк-эмитент карты
  add column if not exists bank_datetime  timestamptz, -- dateTime — время операции на стороне банка
  add column if not exists reason_code    int,         -- reasonCode — числовой код результата/отказа
  add column if not exists payer_name     text,        -- name  — имя плательщика
  add column if not exists payer_phone    text,        -- phone — телефон плательщика
  add column if not exists payer_email    text;        -- email — e-mail плательщика

-- ── Бэкфилл из raw_postlink. Пустые строки банка ("") → NULL ──────────────────
update public.payments p set
  approval_code = nullif(p.raw_postlink->>'approvalCode', ''),
  card_type     = nullif(p.raw_postlink->>'cardType', ''),
  issuer        = nullif(p.raw_postlink->>'issuer', ''),
  bank_datetime = nullif(p.raw_postlink->>'dateTime', '')::timestamptz,
  reason_code   = nullif(p.raw_postlink->>'reasonCode', '')::int,
  payer_name    = nullif(p.raw_postlink->>'name', ''),
  payer_phone   = nullif(p.raw_postlink->>'phone', ''),
  payer_email   = nullif(p.raw_postlink->>'email', '')
where p.raw_postlink is not null;

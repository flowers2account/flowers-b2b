-- Миграция: платёжный модуль epay
-- Применить в Supabase SQL Editor или через CLI

-- Sequence для invoice_id (человекочитаемые номера платежей)
CREATE SEQUENCE IF NOT EXISTS payments_invoice_seq START 100001;

-- Таблица платежей
CREATE TABLE IF NOT EXISTS payments (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         int         REFERENCES orders(id),
  invoice_id       text        UNIQUE NOT NULL,
  amount           numeric     NOT NULL,
  currency         text        DEFAULT 'KZT',
  status           text        DEFAULT 'created'
                   CHECK (status IN ('created','processing','success','failed')),
  secret_hash      text        NOT NULL,
  epay_payment_id  text,
  card_mask        text,
  reference        text,
  reason           text,
  raw_postlink     jsonb,
  created_at       timestamptz DEFAULT now(),
  paid_at          timestamptz
);

CREATE INDEX IF NOT EXISTS payments_order_id_idx   ON payments(order_id);
CREATE INDEX IF NOT EXISTS payments_invoice_id_idx ON payments(invoice_id);

-- Добавить поля оплаты в orders
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid','paid','refunded')),
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

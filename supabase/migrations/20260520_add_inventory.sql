CREATE TABLE IF NOT EXISTS inventory_sessions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        REFERENCES auth.users,
  started_at   timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  notes        text
);

CREATE TABLE IF NOT EXISTS inventory_counts (
  id            uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    uuid    NOT NULL REFERENCES inventory_sessions ON DELETE CASCADE,
  product_id    integer NOT NULL REFERENCES products ON DELETE CASCADE,
  counts        integer[] NOT NULL DEFAULT '{}',
  total_counted integer   NOT NULL DEFAULT 0,
  system_stock  integer   NOT NULL DEFAULT 0,
  difference    integer   GENERATED ALWAYS AS (total_counted - system_stock) STORED,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id, product_id)
);

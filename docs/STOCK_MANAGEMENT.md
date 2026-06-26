# Управление остатками — Flowers B2B

> **Обновлено:** 2026-06-26 (сверено с живой БД `jwastcmasactymmzojhi`).  
> ⚠️ Прежняя версия этого файла описывала 3-уровневую схему `products → stock → batches` с FIFO и багом `WHERE price=item.price`. **Всё это удалено** при rebuild ~25.05.2026. Ниже — фактическая плоская модель.

## Модель: плоская

Остаток и цена хранятся прямо в `products`. Таблиц `batches` и `stock` **нет** (остались только копии `_backup_batches_pre_rebuild` / `_backup_stock_pre_rebuild`). Партионного учёта и FIFO нет.

```
products
  ├─ qty            int    -- физический остаток (NOT NULL DEFAULT 0)
  ├─ price          numeric-- цена за единицу
  ├─ previous_price numeric-- старая цена (для тега «Акция»)
  ├─ arrival_date   date   -- дата первого прихода (импорт не перезаписывает)
  ├─ pack_size      int    -- кратность заказа (DEFAULT 5)
  └─ is_active      bool
        │
        ▼
reservations (TTL 30 мин)  ──►  VIEW stock_available  ──►  каталог/корзина
```

## `stock_available` (VIEW) — единственный источник «доступно»

```sql
SELECT id AS product_id,
       qty,
       COALESCE((SELECT sum(r.qty) FROM reservations r
                 WHERE r.product_id = p.id AND r.expires_at > now()), 0)::int AS qty_reserved,
       GREATEST(0, qty - COALESCE((SELECT sum(r.qty) FROM reservations r
                 WHERE r.product_id = p.id AND r.expires_at > now()), 0))::int AS available_qty,
       is_active
FROM products p;
```

- **Нет колонки `price`** — цену брать из `products.price`.
- `qty_reserved` / `available_qty` считаются на лету из активных `reservations`. Никакой колонки `qty_reserved` в `products` или `stock` нет (старая модель).
- Используется в `/api/products`, `/api/cashier/products`, при валидации корзины.

## `reservations` — резервы корзины

```sql
reservations (
  id          serial PK,
  product_id  int  REFERENCES products(id) ON DELETE CASCADE,
  order_id    int  REFERENCES orders(id)   ON DELETE CASCADE,
  client_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,  -- ⚠️ auth.uid, не clients.id
  qty         int  NOT NULL,
  expires_at  timestamptz DEFAULT now() + interval '30 minutes',
  created_at  timestamptz DEFAULT now()
)
```

Жизненный цикл:
1. `POST /api/checkout` создаёт `orders` (pending) + `order_items` + `reservations` (TTL 30 мин). Уведомления НЕ шлются (только после оплаты).
2. Просроченные резервы удаляет cron `/api/cron/cleanup` (раз в сутки) — `DELETE FROM reservations WHERE expires_at < now()`. Никакой синхронизации `qty_reserved` не требуется (он вычисляется во view).
3. Подтверждение/отмена/удаление заказа снимают резервы триггерами (см. ниже).

## Триггеры на `orders`

| Триггер | Когда | Действие |
|---|---|---|
| `trg_order_confirm` (AFTER UPDATE) | статус → `confirmed` | `confirm_order_fifo(id)`: списать остаток, запись в ledger, снять резервы |
| `trg_order_cancel` (AFTER UPDATE) | отмена | снять резервы заказа |
| `trg_order_delete` (BEFORE DELETE) | удаление заказа | снять резервы |
| `trg_order_status_history` (AFTER UPDATE) | смена статуса | запись в `order_history` |
| `set_updated_at_orders` (BEFORE UPDATE) | — | `updated_at = now()` |

### `confirm_order_fifo(p_order_id)` — фактическое тело

> ⚠️ Имя историческое. **FIFO/партий здесь нет** — простое списание остатка.

```sql
FOR item IN SELECT product_id, qty, price FROM order_items WHERE order_id = p_order_id LOOP
  SELECT qty INTO qty_before FROM products WHERE id = item.product_id;
  UPDATE products SET qty = GREATEST(0, qty - item.qty) WHERE id = item.product_id;
  INSERT INTO inventory_ledger (product_id, action, quantity, qty_before, qty_after, reference_type, reference_id)
  VALUES (item.product_id, 'sale', item.qty, qty_before, GREATEST(0, qty_before - item.qty), 'order', p_order_id);
END LOOP;
DELETE FROM reservations WHERE order_id = p_order_id;
```

Переход статуса идёт через RPC `apply_order_transition(order_id, target, enforce_stock)`: advisory-lock на заказ, идемпотентность (повторный вебхук → no-op), при `confirmed` — проверка остатков внутри лока, затем `UPDATE orders SET status` (триггеры доделывают списание/историю).

## `inventory_ledger` — аудит остатков (append-only)

```sql
inventory_ledger (id bigserial, product_id int, action ledger_action,
  quantity int, qty_before int, qty_after int,
  reference_type text, reference_id int, created_by uuid, notes text, created_at timestamptz)
```
`ledger_action` enum: `import | sale | reserve | release | adjustment | cancel | writeoff`. Пишется из `confirm_order_fifo` (`sale`) и из `writeoffs`/корректировок.

## `writeoffs` — списания

`writeoffs (id, product_id, quantity, reason, photo_url, created_by, created_at)`. RLS включён (authenticated insert/select); запись через `/api/writeoffs` (admin/manager, service-role), уведомление в Telegram. Триггер `after_writeoff_refresh_analytics` обновляет аналитику списаний.

## Инвентаризация

`inventory_sessions` + `inventory_counts` — сессии пересчёта с усреднением нескольких замеров. Роуты `/api/inventory/sessions`, `/api/inventory/add-count`. Корректировки идут в `products.qty` + `inventory_ledger`.

## Мёртвый код в БД (не вызывается)

`sync_stock_from_1c`, `sync_stock_from_batches`, `sync_stock_reserves` — ссылаются на удалённые `stock`/`batches`. Кандидаты на DROP (см. `DOCS_AUDIT_REPORT.md`).

## Диагностика (актуальные запросы)

```sql
-- Oversell (доступно < 0) — не должно случаться (GREATEST(0,...))
SELECT product_id, available_qty FROM stock_available WHERE available_qty < 0;

-- Зависшие резервы (если cron не отработал)
SELECT product_id, sum(qty) FROM reservations WHERE expires_at < now() GROUP BY product_id;

-- Движение по товару
SELECT * FROM inventory_ledger WHERE product_id = :id ORDER BY created_at DESC;
```

См. также: `STOCK_QUICK_REF.md`, `NAMING_SYSTEM_STATE.md`, `CONTEXT_FOR_NEW_SESSION.md`.
</content>

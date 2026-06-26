# Остатки — Quick Reference

> **Обновлено:** 2026-06-26. Полная версия — [STOCK_MANAGEMENT.md](./STOCK_MANAGEMENT.md).  
> ⚠️ Старая версия описывала `stock`/`batches`/FIFO — всё удалено (rebuild ~25.05.2026).

## Модель (плоская)

```
products.qty (остаток) + products.price (цена)
        │
   reservations (TTL 30 мин)
        │
   VIEW stock_available  →  available_qty = GREATEST(0, qty − Σ активных резервов)
```

- Остаток — `products.qty` (int, NOT NULL). Цена — `products.price`. Никаких `stock`/`batches`.
- `pack_size` DEFAULT **5** (кратность заказа).
- Доступность — view `stock_available` (`product_id, qty, qty_reserved, available_qty, is_active`; **без price**).
- Резерв — `reservations.expires_at` (30 мин). Чистит cron `0 0 * * *` (раз в сутки).

## Списание при подтверждении заказа

`orders.status → confirmed` ⇒ триггер `trg_order_confirm` ⇒ `confirm_order_fifo(id)`:
```
products.qty := GREATEST(0, qty − ordered)   -- НЕТ FIFO, НЕТ партий
→ inventory_ledger (action='sale')
→ DELETE reservations заказа
```
Переход статуса — через RPC `apply_order_transition` (advisory-lock + проверка остатков для `confirmed`).

## Тег «Акция»

`products.previous_price > price` ⇒ UI показывает зачёркнутую старую цену. `previous_price` заполняет импорт при снижении цены.

## Диагностика

```sql
SELECT product_id, available_qty FROM stock_available WHERE available_qty < 0;     -- oversell
SELECT product_id, sum(qty) FROM reservations WHERE expires_at < now() GROUP BY 1; -- зависшие резервы
SELECT * FROM inventory_ledger WHERE product_id = :id ORDER BY created_at DESC;     -- движение
```

## Чего НЕТ (вопреки старым докам)

- ❌ таблиц `stock`, `batches`; ❌ колонки `qty_reserved` в products; ❌ FIFO; ❌ view `products_available`.
- ❌ бага `WHERE price = item.price` (жил в batches-версии, удалён).
- ⚠️ Функции `sync_stock_from_1c/from_batches/reserves` остались в БД, но **мёртвые** (ссылаются на удалённые таблицы).
</content>

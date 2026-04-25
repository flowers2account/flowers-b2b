# Обновление триггера confirm_order_fifo для отслеживания qty_reserved

## SQL для Supabase

Выполните этот SQL скрипт в Supabase Dashboard → SQL Editor для обновления триггера `confirm_order_fifo`:

```sql
-- Обновить существующий триггер confirm_order_fifo
-- Добавить обновление qty_reserved при удалении резервирований

CREATE OR REPLACE FUNCTION confirm_order_fifo()
RETURNS TRIGGER AS $$
DECLARE
  v_order_item RECORD;
  v_stock_row RECORD;
  v_qty_reserved INT;
  v_deleted_reservations RECORD;
BEGIN
  -- Только если статус изменился на 'confirmed'
  IF NEW.status = 'confirmed' AND OLD.status != 'confirmed' THEN
    
    -- Обработать каждый товар в заказе
    FOR v_order_item IN
      SELECT product_id, qty
      FROM order_items
      WHERE order_id = NEW.id
    LOOP
      -- Получить текущий stock
      SELECT * INTO v_stock_row
      FROM stock
      WHERE product_id = v_order_item.product_id
      FOR UPDATE;

      IF v_stock_row IS NOT NULL THEN
        -- Уменьшить qty на количество из заказа (FIFO)
        UPDATE stock
        SET qty = GREATEST(0, qty - v_order_item.qty)
        WHERE product_id = v_order_item.product_id;

        -- Уменьшить qty_reserved на количество зарезервированных товаров
        UPDATE stock
        SET qty_reserved = GREATEST(0, qty_reserved - v_order_item.qty)
        WHERE product_id = v_order_item.product_id;
      END IF;
    END LOOP;

    -- Удалить резервирования для этого заказа
    DELETE FROM reservations
    WHERE order_id = NEW.id;

    -- Обновить статус на 'confirmed'
    UPDATE orders
    SET status = 'confirmed'
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Убедитесь, что триггер существует
-- Если триггера нет, создайте его:
DROP TRIGGER IF EXISTS trg_confirm_order ON orders;

CREATE TRIGGER trg_confirm_order
AFTER UPDATE OF status ON orders
FOR EACH ROW
WHEN (NEW.status = 'confirmed' AND OLD.status != 'confirmed')
EXECUTE FUNCTION confirm_order_fifo();
```

## Альтернативный подход (если используется другой триггер)

Если у вас есть триггер с другим именем, найдите его и добавьте строку:

```sql
-- Найти и просмотреть существующий триггер
SELECT trigger_name, event_object_table
FROM information_schema.triggers
WHERE event_object_table = 'orders'
  AND event_manipulation = 'UPDATE';

-- После подтверждения заказа уменьшить qty_reserved
UPDATE stock
SET qty_reserved = GREATEST(0, qty_reserved - ordered_qty)
WHERE product_id = item_product_id;
```

## Проверка

После обновления триггера проверьте, что:

1. Подтверждение заказа уменьшает `qty_reserved`
2. Значение `qty_reserved` никогда не становится отрицательным (используется GREATEST)
3. Резервирования удаляются при подтверждении

```sql
-- Проверить qty_reserved для товара
SELECT product_id, qty, qty_reserved, qty - qty_reserved as available
FROM stock
WHERE product_id = 1;

-- Проверить резервирования
SELECT product_id, qty, expires_at, order_id
FROM reservations
WHERE product_id = 1
ORDER BY expires_at DESC;
```

## Порядок выполнения при подтверждении заказа

1. Уменьшить `qty` (списанный товар)
2. Уменьшить `qty_reserved` (освободить зарезервированное количество)
3. Удалить резервирования из таблицы `reservations`
4. Обновить статус заказа на `confirmed`

# Остатки — Quick Reference

> **Дата:** 24 мая 2026  
> **Полная документация:** [STOCK_MANAGEMENT_FEATURE.md](./STOCK_MANAGEMENT_FEATURE.md)

---

## 🎯 Архитектура (3 уровня)

```
PRODUCTS (каталог)
    ↓
STOCK (текущие остатки) ← главная точка правды
    ↓
BATCHES (партии для FIFO)
    ↓
STOCK_AVAILABLE (VIEW для клиента)
```

---

## 📊 Ключевые таблицы

### `stock`
- `qty` — общий остаток
- `qty_reserved` — резерв системы ⚠️ не очищается автоматически
- `price` — текущая цена

### `batches`
- `stock` — остаток в партии
- `arrival_date` — для FIFO
- `price` — цена партии
- `is_active` — false = списана

### `stock_available` (VIEW)
```sql
available_qty = stock.qty 
              - stock.qty_reserved 
              - SUM(активные reservations)
```

### `reservations`
- TTL: 30 минут
- Очистка: cron раз в день

---

## 🔴 Критические баги

### 1. FIFO сломан
**Проблема:**
```sql
WHERE batches.price = order_items.price
```
При изменении цены старые партии **зависают**.

**Решение:** Убрать фильтр по цене
```sql
ORDER BY arrival_date ASC  -- чистый FIFO
```

---

### 2. qty_reserved не очищается
**Проблема:** Cron удаляет `reservations`, но триггер на UPDATE stock отсутствует.

**Решение:**
```sql
CREATE TRIGGER trg_sync_reserved_delete
AFTER DELETE ON reservations
FOR EACH ROW
EXECUTE FUNCTION sync_reserved_on_delete();
```

---

### 3. Импорт XLS суммирует qty
**Проблема:** При повторном импорте создаётся новая партия → qty удваивается.

**Нужно:** Определить логику — замена или пополнение?

---

## 🔧 SQL функции

### `sync_stock_from_batches()`
Синхронизирует `stock.qty = SUM(batches.stock WHERE is_active)`

### `sync_stock_reserves()`
Пересчитывает `qty_reserved` из активных резервов

### `confirm_order_fifo(order_id)`
FIFO списание при подтверждении заказа

---

## 🧪 SQL диагностика

```sql
-- Проверка синхронизации stock ↔ batches
SELECT p.name, s.qty, SUM(b.stock) as batches_sum
FROM products p
JOIN stock s ON s.product_id = p.id
LEFT JOIN batches b ON b.product_id = p.id AND b.is_active = true
GROUP BY p.id, s.qty
HAVING s.qty != COALESCE(SUM(b.stock), 0);

-- Зависшие партии (is_active = true, stock = 0)
SELECT p.name, b.price, b.arrival_date
FROM batches b
JOIN products p ON p.id = b.product_id
WHERE b.is_active = true AND b.stock = 0;

-- Расхождения qty_reserved
SELECT p.name, s.qty_reserved, SUM(r.qty) as actual
FROM stock s
JOIN products p ON p.id = s.product_id
LEFT JOIN reservations r ON r.product_id = p.id AND r.expires_at > now()
GROUP BY p.id, s.qty_reserved
HAVING s.qty_reserved != COALESCE(SUM(r.qty), 0);

-- Oversell (available_qty < 0)
SELECT p.name, sa.available_qty
FROM stock_available sa
JOIN products p ON p.id = sa.product_id
WHERE sa.available_qty < 0;
```

---

## 📝 Checklist перед деплоем

- [ ] FIFO исправлен (убран фильтр `WHERE price = ?`)
- [ ] Триггер `sync_reserved_on_delete` создан
- [ ] Импорт XLS проверен (замена vs пополнение)
- [ ] Cron cleanup работает
- [ ] `stock_available` VIEW корректен

---

## 🎯 План исправлений

### 🔥 Фаза 1 (срочно)
1. Исправить FIFO — убрать `WHERE price = item.price`
2. Добавить триггер на DELETE reservations
3. Проверить импорт XLS

### 🟡 Фаза 2 (следующий спринт)
4. Клиентский таймер для резервов
5. Автозаполнение `inventory_ledger`
6. Low stock alerts

### 🟢 Фаза 3 (потом)
7. Batch expiry (срок годности)
8. Price history VIEW
9. Inventory count UI

---

**Полная версия:** [STOCK_MANAGEMENT_FEATURE.md](./STOCK_MANAGEMENT_FEATURE.md)

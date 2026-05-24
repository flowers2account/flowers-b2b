# Управление остатками — Flowers B2B

**Дата:** 24 мая 2026  
**Статус:** В разработке (критические баги требуют исправления)

---

## 📋 Оглавление

1. [Обзор](#обзор)
2. [Архитектура данных](#архитектура-данных)
3. [Таблицы и их назначение](#таблицы-и-их-назначение)
4. [Бизнес-логика](#бизнес-логика)
5. [Текущие проблемы](#текущие-проблемы)
6. [SQL функции и триггеры](#sql-функции-и-триггеры)
7. [API endpoints](#api-endpoints)
8. [План исправлений](#план-исправлений)

---

## Обзор

Система управления остатками построена на **трёхуровневой архитектуре**:

- **Уровень 1:** `products` — каталог товаров
- **Уровень 2:** `stock` — текущие остатки (единая точка правды)
- **Уровень 3:** `batches` — партионный учёт для FIFO списания

**Ключевые возможности:**
- Партионный учёт с датами прихода
- FIFO списание при подтверждении заказов
- Временное резервирование (30 мин) для корзин
- Синхронизация с импортом из Excel/1C
- Защита от oversell

**Текущая статистика:**
- 655 товаров в базе (335 активных)
- 136 товаров в наличии
- 4969 партий (192 активные)
- 0 активных резервов

---

## Архитектура данных

```
┌─────────────────────────────────────────────────────┐
│ PRODUCTS (655 товаров, 335 активных)                │
│ ├─ Базовая информация: name, category, pack_size   │
│ ├─ Маркетинг: image_url, colors, origin, tags      │
│ └─ Метаданные: variety_id, normalized_slug         │
└──────────────────┬──────────────────────────────────┘
                   │
        ┌──────────┴──────────┐
        │                     │
┌───────▼────────┐   ┌────────▼──────────────┐
│ STOCK          │   │ BATCHES               │
│ (655 записей)  │   │ (4969 записей)        │
│                │   │                       │
│ qty: 655       │   │ active: 192           │
│ qty_reserved:0 │   │ arrival_date (FIFO)   │
│ price          │   │ price (партионная)    │
│ is_available   │   │ stock, stock_reserved │
└───────┬────────┘   │ origin, farm          │
        │            └───────────────────────┘
        │
┌───────▼───────────────────────┐
│ STOCK_AVAILABLE (VIEW)        │
│                               │
│ available_qty =               │
│   stock.qty                   │
│   - stock.qty_reserved        │
│   - SUM(active reservations)  │
│                               │
│ reserved_qty (30 мин TTL)     │
└───────────────────────────────┘
        │
        │ используется в
        │
┌───────▼───────────────────────┐
│ КАТАЛОГ (клиентская часть)    │
│ ProductCard, PriceTable       │
│ Показывает available_qty      │
└───────────────────────────────┘
```

---

## Таблицы и их назначение

### 1. `products` — Каталог товаров

**Назначение:** Базовый справочник товаров с атрибутами для фильтрации и отображения.

**Ключевые поля:**
```sql
id              INTEGER PRIMARY KEY
variety_id      INTEGER (FK → varieties.id)
name            TEXT NOT NULL
category        product_category ('cut' | 'pot')
length_cm       INTEGER
pack_size       INTEGER DEFAULT 1
image_url       TEXT
is_active       BOOLEAN DEFAULT true
previous_price  NUMERIC (для бейджа "Уценка")
color, colors   TEXT, TEXT[] (для фильтров)
origin          TEXT CHECK (ecuador|kenya|holland|china|local|other|colombia|israel)
variety_type    TEXT (bush|spray|single)
floral_role     TEXT (focal|filler|foliage)
```

**Constraint:**
```sql
UNIQUE NULLS NOT DISTINCT (variety_id, length_str)
```
Горшечные товары имеют `length_str = NULL` — это нормально.

**Связь с остатками:**
```sql
products.id → stock.product_id (1:1)
products.id → batches.product_id (1:N)
```

---

### 2. `stock` — Текущие остатки (главная точка правды)

**Назначение:** Хранит текущее количество и цену для каждого товара.

**Структура:**
```sql
CREATE TABLE stock (
  id             SERIAL PRIMARY KEY,
  product_id     INTEGER UNIQUE NOT NULL REFERENCES products(id),
  qty            INTEGER DEFAULT 0 CHECK (qty >= 0),
  qty_reserved   INTEGER DEFAULT 0,
  price          NUMERIC DEFAULT 0,
  is_available   BOOLEAN DEFAULT true,  -- не используется в логике
  updated_at     TIMESTAMPTZ DEFAULT now()
);
```

**Правила:**
- `product_id` — UNIQUE, т.е. одна запись на товар
- `qty` — общее количество на складе
- `qty_reserved` — зарезервировано системой (**⚠️ не очищается автоматически**)
- `price` — текущая цена продажи

**⚠️ Критическая проблема:**
`qty_reserved` не синхронизируется при удалении истёкших резервов. Cron очищает `reservations`, но триггер на UPDATE stock отсутствует.

---

### 3. `batches` — Партионный учёт

**Назначение:** Хранение партий для FIFO списания и трейсинга происхождения.

**Структура:**
```sql
CREATE TABLE batches (
  id             SERIAL PRIMARY KEY,
  product_id     INTEGER NOT NULL REFERENCES products(id),
  price          NUMERIC NOT NULL,
  stock          INTEGER DEFAULT 0,
  stock_reserved INTEGER DEFAULT 0,
  arrival_date   DATE DEFAULT CURRENT_DATE,
  is_active      BOOLEAN DEFAULT true,
  origin         TEXT CHECK (ecuador|kenya|holland|china|local|other),
  farm           TEXT,
  created_at     TIMESTAMPTZ DEFAULT now()
);
```

**Ключевые поля:**
- `arrival_date` — дата прихода партии (основа для FIFO)
- `price` — цена партии (может отличаться от stock.price)
- `is_active` — false = партия полностью списана
- `origin, farm` — источник товара для трейсинга

**FIFO логика:**
```sql
-- При подтверждении заказа (confirm_order_fifo)
SELECT * FROM batches
WHERE product_id = ? 
  AND is_active = true
  AND stock > 0
  AND price = ?  -- ⚠️ ПРОБЛЕМА: блокирует списание при изменении цены
ORDER BY arrival_date ASC, price ASC
```

**⚠️ Критическая проблема:**
Фильтр `WHERE price = order_items.price` блокирует FIFO при разных ценах. Если цена изменилась, старые партии **зависают** и не списываются.

**Статистика:**
- Всего партий: 4969
- Активных: 192
- Средний размер активной партии: ~7 единиц

---

### 4. `stock_available` (VIEW) — Клиентский интерфейс

**Назначение:** Показывает доступное количество с учётом резервов.

**Определение:**
```sql
CREATE VIEW stock_available AS
SELECT 
  product_id,
  qty,
  qty_reserved,
  price,
  is_available,
  
  -- Сумма активных резервов (expires_at > now())
  COALESCE(
    (SELECT SUM(r.qty) 
     FROM reservations r 
     WHERE r.product_id = s.product_id 
       AND r.expires_at > now()), 
    0
  ) AS reserved_qty,
  
  -- Доступное количество
  GREATEST(
    0,
    qty - qty_reserved - COALESCE(
      (SELECT SUM(r.qty) 
       FROM reservations r 
       WHERE r.product_id = s.product_id 
         AND r.expires_at > now()), 
      0
    )
  ) AS available_qty

FROM stock s;
```

**Использование:**
- Каталог (`/api/products`) — показывает `available_qty`
- ProductCard, DetailPanel — отображают остаток для клиента
- Корзина — валидирует количество перед checkout

**Формула:**
```
available_qty = stock.qty 
              - stock.qty_reserved 
              - SUM(активные reservations где expires_at > now())
```

---

### 5. `reservations` — Временные резервы корзин

**Назначение:** Защита от oversell при одновременных заказах.

**Структура:**
```sql
CREATE TABLE reservations (
  id          SERIAL PRIMARY KEY,
  product_id  INTEGER NOT NULL REFERENCES products(id),
  order_id    INTEGER REFERENCES orders(id),
  qty         INTEGER NOT NULL CHECK (qty > 0),
  expires_at  TIMESTAMPTZ DEFAULT (now() + INTERVAL '30 minutes'),
  user_id     UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ DEFAULT now()
);
```

**Жизненный цикл:**
1. Создание заказа (`/api/checkout`) → INSERT в reservations с TTL 30 мин
2. Триггер на INSERT → UPDATE stock.qty_reserved += qty
3. По истечении 30 мин → cron удаляет запись
4. **⚠️ ПРОБЛЕМА:** stock.qty_reserved НЕ обновляется при удалении

**Очистка:**
- **Текущая:** cron `/api/cron/cleanup` раз в день (`"0 0 * * *"`)
- **По документации:** каждые 5 минут
- **Ограничение:** Vercel Hobby — только раз в день

**Триггеры:**
```sql
-- При отмене/подтверждении заказа
CREATE TRIGGER trg_cancel_reservations
AFTER UPDATE ON orders
WHEN (NEW.status IN ('cancelled', 'confirmed'))
EXECUTE FUNCTION cancel_reservations();

-- При удалении заказа
CREATE TRIGGER trg_order_delete
BEFORE DELETE ON orders
EXECUTE FUNCTION cancel_reservations_on_delete();
```

---

### 6. `inventory_ledger` — История изменений (append-only)

**Назначение:** Полный аудит всех операций с остатками.

**Структура:**
```sql
CREATE TABLE inventory_ledger (
  id             BIGSERIAL PRIMARY KEY,
  product_id     INTEGER NOT NULL REFERENCES products(id),
  action         ledger_action NOT NULL,
  quantity       INTEGER NOT NULL,
  qty_before     INTEGER NOT NULL,
  qty_after      INTEGER NOT NULL,
  reference_type TEXT,     -- 'order' | 'import' | 'writeoff'
  reference_id   INTEGER,  -- order_id | import_id | writeoff_id
  created_by     UUID REFERENCES profiles(id),
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE TYPE ledger_action AS ENUM (
  'import',      -- Импорт из XLS/1C
  'sale',        -- Продажа (подтверждённый заказ)
  'reserve',     -- Резервирование
  'release',     -- Снятие резерва
  'adjustment',  -- Ручная корректировка
  'cancel',      -- Отмена заказа
  'writeoff'     -- Списание (порча, брак)
);
```

**Использование:**
- Аудит для бухгалтерии
- Расследование расхождений
- Отчёты по движению товаров

**⚠️ Текущее состояние:** 2 записи (почти не используется)

---

### 7. `writeoffs` — Списания (брак, порча)

**Назначение:** Учёт списаний с причиной и фото.

**Структура:**
```sql
CREATE TABLE writeoffs (
  id          BIGSERIAL PRIMARY KEY,
  product_id  INTEGER NOT NULL REFERENCES products(id),
  quantity    INTEGER NOT NULL CHECK (quantity > 0),
  reason      TEXT,
  photo_url   TEXT,
  created_by  UUID REFERENCES profiles(id),
  created_at  TIMESTAMPTZ DEFAULT now()
);
```

**RLS:** Отключён — безопасность через API route (проверка роли admin/manager)

**⚠️ Текущее состояние:** 2 записи

---

## Бизнес-логика

### Создание заказа (checkout)

**Endpoint:** `POST /api/checkout`

**Процесс:**
1. Валидация корзины — проверка `available_qty >= cart_qty`
2. Создание записи в `orders` (status = 'pending')
3. Создание записей в `order_items`
4. **Резервирование:**
   ```sql
   INSERT INTO reservations (product_id, order_id, qty, expires_at)
   VALUES (?, ?, ?, now() + INTERVAL '30 minutes');
   ```
5. Триггер автоматически увеличивает `stock.qty_reserved`
6. Отправка уведомления в Telegram менеджеру

**Защита от oversell:**
- Транзакция с `SELECT FOR UPDATE`
- Проверка `available_qty` перед INSERT

---

### Подтверждение заказа (confirm)

**Endpoint:** `POST /api/confirm-order`

**Процесс:**
1. UPDATE orders SET status = 'confirmed'
2. Триггер `trg_confirm_order` вызывает `confirm_order_fifo(order_id)`
3. Функция FIFO списания:
   ```sql
   FOR item IN (SELECT * FROM order_items WHERE order_id = ...)
   LOOP
     -- Списание из batches по FIFO
     FOR batch IN (
       SELECT * FROM batches
       WHERE product_id = item.product_id
         AND is_active = true
         AND stock > 0
         AND price = item.price  -- ⚠️ ПРОБЛЕМА
       ORDER BY arrival_date ASC, price ASC
     )
     LOOP
       -- Списание из партии
       UPDATE batches SET stock = stock - to_deduct;
       
       -- Деактивация пустых партий
       IF stock = 0 THEN
         UPDATE batches SET is_active = false;
       END IF;
     END LOOP;
   END LOOP;
   ```
4. Вызов `sync_stock_from_batches()` — обновление `stock.qty`
5. Триггер `trg_cancel_reservations` удаляет резервы

**⚠️ Критическая проблема:**
`WHERE price = item.price` блокирует FIFO при разных ценах. Старые партии зависают.

---

### Отмена заказа (cancel)

**Endpoint:** `POST /api/cancel-order`

**Процесс:**
1. UPDATE orders SET status = 'cancelled'
2. Триггер `trg_cancel_reservations` → DELETE FROM reservations
3. **⚠️ ПРОБЛЕМА:** `stock.qty_reserved` НЕ обновляется

---

### Импорт из XLS

**Endpoint:** `POST /api/import-xls`

**Процесс:**
1. Парсинг Excel файла (XLSX.read)
2. Определение категории по имени файла:
   - `Горшок*.xls` → category = 'pot'
   - `Срез*.xls` → category = 'cut'
3. Для каждой строки:
   ```sql
   -- Вставка/обновление variety
   INSERT INTO varieties (name, category)
   ON CONFLICT (name) DO UPDATE ...;
   
   -- Вставка товара (ignoreDuplicates: true)
   INSERT INTO products (variety_id, name, length_str, pack_size, ...)
   ON CONFLICT (variety_id, length_str) DO NOTHING;
   
   -- Вставка партии
   INSERT INTO batches (product_id, price, stock, arrival_date)
   VALUES (...);
   ```
4. Вызов `sync_stock_from_batches()` — синхронизация `stock.qty`

**⚠️ Проблема из PROJECT_STATUS:**
> qty суммируется вместо замены для некоторых позиций

**Текущая логика:**
- Новые позиции: `INSERT INTO batches`
- Старые позиции: `ignoreDuplicates` → НЕ обновляется

**Нужно:**
- Либо `ON CONFLICT DO UPDATE SET stock = EXCLUDED.stock`
- Либо `UPDATE batches SET is_active = false; INSERT ...`

---

### Cron cleanup

**Endpoint:** `GET /api/cron/cleanup` (protected by `CRON_SECRET`)

**Расписание:** `"0 0 * * *"` (раз в день, ограничение Vercel Hobby)

**Процесс:**
```sql
DELETE FROM reservations 
WHERE expires_at < now();
```

**⚠️ Проблема:** `stock.qty_reserved` не обновляется после удаления.

---

## Текущие проблемы

### 🔴 Критические (блокируют корректную работу)

#### 1. FIFO сломан при разных ценах

**Проблема:**
```sql
-- confirm_order_fifo.sql
WHERE batches.price = order_items.price
```
Если цена изменилась, старая партия не списывается.

**Пример:**
1. Партия A: arrival_date = 2026-05-01, price = 100₸, stock = 50
2. Партия B: arrival_date = 2026-05-15, price = 120₸, stock = 50
3. Заказ на 10 шт по цене 120₸
4. Система НЕ списывает из партии A (цена не совпадает)
5. Партия A зависает навсегда

**Решение на выбор:**

**А) Чистый FIFO** (рекомендуется):
```sql
SELECT * FROM batches
WHERE product_id = item.product_id
  AND is_active = true
  AND stock > 0
ORDER BY arrival_date ASC
LIMIT 1;
```

**Б) FIFO внутри цены:**
```sql
-- Группировать партии по цене
-- Внутри группы списывать по FIFO
```

**В) Weighted average:**
```sql
-- Средневзвешенная цена всех партий
-- Усложняет бухгалтерию
```

---

#### 2. `qty_reserved` не очищается автоматически

**Проблема:**
- Cron удаляет истёкшие `reservations`
- `stock.qty_reserved` остаётся прежним
- `stock_available.available_qty` занижается

**Воспроизведение:**
1. Клиент создаёт заказ → `qty_reserved += 10`
2. Через 30 мин резерв истекает → cron удаляет из `reservations`
3. `stock.qty_reserved` всё ещё = 10
4. Товар показывается как недоступный

**Решение:**
```sql
-- Триггер на DELETE в reservations
CREATE OR REPLACE FUNCTION sync_reserved_on_delete()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE stock 
  SET qty_reserved = qty_reserved - OLD.qty
  WHERE product_id = OLD.product_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_reserved_delete
AFTER DELETE ON reservations
FOR EACH ROW
EXECUTE FUNCTION sync_reserved_on_delete();
```

**Альтернатива:** Вызывать `sync_stock_reserves()` в cron после очистки.

---

### 🟡 Некритические (не блокируют, но требуют внимания)

#### 3. Cron cleanup раз в день вместо каждых 5 минут

**По документации:** `/api/cron/cleanup` должен вызываться каждые 5 мин  
**Сейчас:** `"0 0 * * *"` (раз в день)

**Причина:** Vercel Hobby — только 1 cron в день

**Последствия:**
- Резервы висят до 24 часов
- Товары показываются как недоступные

**Решение:**
- **Вариант А:** Клиентский таймер в AuthStore — очистка истёкших резервов на фронте
- **Вариант Б:** Vercel Pro — поддержка частых cron

---

#### 4. Импорт XLS суммирует qty вместо замены

**Проблема из PROJECT_STATUS:**
> qty суммируется вместо замены для некоторых позиций

**Текущая логика:**
```sql
-- Для новых товаров
INSERT INTO products (...) 
ON CONFLICT (variety_id, length_str) DO NOTHING;

-- Для партий
INSERT INTO batches (product_id, price, stock, arrival_date);
```

**Результат:**
- При повторном импорте создаётся **новая партия**
- `stock.qty` суммируется через `sync_stock_from_batches()`
- Вместо 50 показывает 100

**Нужно:**
- Либо деактивировать старые партии: `UPDATE batches SET is_active = false`
- Либо обновлять: `ON CONFLICT DO UPDATE SET stock = EXCLUDED.stock`

**Решение зависит от бизнес-логики:**
- Если один XLS = полная замена → деактивировать старые
- Если XLS = пополнение → текущая логика верна

---

#### 5. `inventory_ledger` почти не используется

**Текущее состояние:** 2 записи

**Проблема:** Нет автоматического логирования операций

**Решение:**
Добавить триггеры на:
- `orders.status → 'confirmed'` → INSERT ledger (action = 'sale')
- `writeoffs` → INSERT ledger (action = 'writeoff')
- `batches` INSERT → INSERT ledger (action = 'import')

---

## SQL функции и триггеры

### Функции

#### 1. `sync_stock_from_batches()`
**Назначение:** Синхронизирует `stock.qty` с суммой активных партий.

```sql
CREATE OR REPLACE FUNCTION sync_stock_from_batches()
RETURNS void AS $$
BEGIN
  UPDATE stock s
  SET qty = COALESCE(
    (SELECT SUM(b.stock) 
     FROM batches b 
     WHERE b.product_id = s.product_id 
       AND b.is_active = true),
    0
  );
END;
$$ LANGUAGE plpgsql;
```

**Вызывается:**
- После импорта XLS
- После FIFO списания в `confirm_order_fifo`

---

#### 2. `sync_stock_reserves()`
**Назначение:** Пересчитывает `qty_reserved` из активных резервов.

```sql
CREATE OR REPLACE FUNCTION sync_stock_reserves()
RETURNS void AS $$
BEGIN
  UPDATE stock s
  SET qty_reserved = COALESCE(
    (SELECT SUM(r.qty) 
     FROM reservations r 
     WHERE r.product_id = s.product_id 
       AND r.expires_at > now()),
    0
  );
END;
$$ LANGUAGE plpgsql;
```

**Вызывается:** Вручную (нужно добавить в cron или триггер)

---

#### 3. `sync_stock_from_1c()`
**Назначение:** Умная синхронизация при импорте из 1С.

**Логика:**
- Если `new_qty > stock.qty` → новая партия (arrival_date = сегодня)
- Если `new_qty < stock.qty` → корректировка старых партий

```sql
CREATE OR REPLACE FUNCTION sync_stock_from_1c(
  p_product_name TEXT,
  p_new_qty INTEGER,
  p_new_price NUMERIC,
  p_arrival_date DATE,
  p_category TEXT
) RETURNS void AS $$
DECLARE
  v_product_id INTEGER;
  v_old_qty INTEGER;
BEGIN
  -- Найти товар
  SELECT id INTO v_product_id
  FROM products
  WHERE name = p_product_name AND category = p_category;
  
  -- Получить текущий остаток
  SELECT qty INTO v_old_qty
  FROM stock
  WHERE product_id = v_product_id;
  
  -- Логика синхронизации
  IF p_new_qty > v_old_qty THEN
    -- Рост — новая партия
    INSERT INTO batches (product_id, price, stock, arrival_date)
    VALUES (v_product_id, p_new_price, p_new_qty - v_old_qty, p_arrival_date);
  ELSE
    -- Падение — корректировка старых партий
    -- (логика списания)
  END IF;
  
  -- Синхронизация stock.qty
  PERFORM sync_stock_from_batches();
END;
$$ LANGUAGE plpgsql;
```

**Комментарий из БД:**
> Умная синхронизация: если остаток вырос → новая партия с новой датой, если упал → корректировка старых

---

#### 4. `confirm_order_fifo(order_id)`
**Назначение:** FIFO списание при подтверждении заказа.

**⚠️ Текущая версия (с багом):**
```sql
CREATE OR REPLACE FUNCTION confirm_order_fifo(p_order_id INTEGER)
RETURNS void AS $$
DECLARE
  item RECORD;
  batch RECORD;
  remaining INTEGER;
  to_deduct INTEGER;
BEGIN
  FOR item IN (
    SELECT * FROM order_items 
    WHERE order_id = p_order_id
  )
  LOOP
    remaining := item.qty;
    
    FOR batch IN (
      SELECT * FROM batches
      WHERE product_id = item.product_id
        AND is_active = true
        AND stock > 0
        AND price = item.price  -- ⚠️ ПРОБЛЕМА
      ORDER BY arrival_date ASC, price ASC
    )
    LOOP
      EXIT WHEN remaining = 0;
      
      to_deduct := LEAST(batch.stock, remaining);
      
      UPDATE batches
      SET stock = stock - to_deduct
      WHERE id = batch.id;
      
      -- Деактивация пустых партий
      UPDATE batches
      SET is_active = false
      WHERE id = batch.id AND stock = 0;
      
      remaining := remaining - to_deduct;
    END LOOP;
  END LOOP;
  
  -- Синхронизация stock.qty
  PERFORM sync_stock_from_batches();
END;
$$ LANGUAGE plpgsql;
```

**Нужно исправить:** Убрать `WHERE price = item.price`

---

### Триггеры

#### 1. `trg_confirm_order`
```sql
CREATE TRIGGER trg_confirm_order
AFTER UPDATE ON orders
FOR EACH ROW
WHEN (NEW.status = 'confirmed' AND OLD.status != 'confirmed')
EXECUTE FUNCTION confirm_order_fifo_trigger();
```

**Вызывает:** `confirm_order_fifo(order_id)`

---

#### 2. `trg_cancel_reservations`
```sql
CREATE TRIGGER trg_cancel_reservations
AFTER UPDATE ON orders
FOR EACH ROW
WHEN (NEW.status IN ('cancelled', 'confirmed'))
EXECUTE FUNCTION cancel_reservations();
```

**Действие:**
```sql
DELETE FROM reservations 
WHERE order_id = NEW.id;
```

**⚠️ Проблема:** `stock.qty_reserved` не обновляется

---

#### 3. `trg_order_delete`
```sql
CREATE TRIGGER trg_order_delete
BEFORE DELETE ON orders
FOR EACH ROW
EXECUTE FUNCTION cancel_reservations_on_delete();
```

---

#### 4. `trg_order_history` (на таблице orders)
```sql
CREATE TRIGGER trg_order_history
AFTER UPDATE ON orders
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION log_order_status_change();
```

**Действие:** INSERT в `order_history` с snapshot заказа

**⚠️ Важно:** Использует `SECURITY DEFINER` для обхода RLS

---

## API endpoints

### Остатки

#### `GET /api/products`
**Назначение:** Список товаров для каталога

**Query params:**
- `category` — фильтр по категории
- `search` — поиск по имени

**Возвращает:**
```typescript
{
  id: number
  name: string
  category: 'cut' | 'pot'
  price: number
  available_qty: number  // из stock_available VIEW
  reserved_qty: number
  image_url: string
  colors: string[]
  origin: string
  // ... другие поля
}
```

**Источник:** JOIN `products` + `stock_available`

---

#### `GET /api/stock/summary`
**Назначение:** Сводка по остаткам для админки

**Возвращает:**
```typescript
{
  total_products: number
  active_products: number
  in_stock: number
  reserved: number
  total_value: number  // сумма stock.qty * stock.price
}
```

---

### Заказы

#### `POST /api/checkout`
**Назначение:** Создание заказа + резервирование

**Body:**
```typescript
{
  items: Array<{ product_id: number, qty: number }>
  guest_phone?: string
  guest_name?: string
}
```

**Процесс:**
1. Валидация доступности через `stock_available`
2. INSERT в `orders`, `order_items`, `reservations`
3. Триггер → UPDATE `stock.qty_reserved`
4. Telegram уведомление

---

#### `POST /api/confirm-order`
**Назначение:** Подтверждение отгрузки

**Body:**
```typescript
{
  order_id: number
}
```

**Процесс:**
1. UPDATE orders SET status = 'confirmed'
2. Триггер → `confirm_order_fifo(order_id)`
3. FIFO списание из `batches`
4. Синхронизация `stock.qty`

---

#### `POST /api/cancel-order`
**Назначение:** Отмена заказа

**Body:**
```typescript
{
  order_id: number
}
```

**Процесс:**
1. UPDATE orders SET status = 'cancelled'
2. Триггер → DELETE FROM reservations
3. **⚠️ Не обновляет `stock.qty_reserved`**

---

### Импорт

#### `POST /api/import-xls`
**Назначение:** Импорт товаров из Excel

**Body:** FormData с файлом

**Процесс:**
1. Парсинг XLSX
2. Категория по имени файла (`Горшок*.xls` → pot)
3. INSERT в `varieties`, `products`, `batches`
4. Вызов `sync_stock_from_batches()`

**⚠️ Проблема:** qty суммируется при повторном импорте

---

### Cron

#### `GET /api/cron/cleanup`
**Назначение:** Очистка истёкших резервов

**Auth:** `?secret=${CRON_SECRET}`

**Процесс:**
```sql
DELETE FROM reservations 
WHERE expires_at < now();
```

**Расписание:** `"0 0 * * *"` (раз в день)

**⚠️ Проблема:** `stock.qty_reserved` не обновляется

---

## План исправлений

### 🔥 Фаза 1 — Критические баги (срочно)

#### ✅ Задача 1.1: Исправить FIFO логику
**Приоритет:** 🔴 КРИТИЧЕСКИЙ

**Проблема:** `WHERE price = item.price` блокирует списание

**Решение:**
```sql
-- Убрать фильтр по цене
CREATE OR REPLACE FUNCTION confirm_order_fifo(p_order_id INTEGER)
RETURNS void AS $$
...
FOR batch IN (
  SELECT * FROM batches
  WHERE product_id = item.product_id
    AND is_active = true
    AND stock > 0
    -- УБРАТЬ: AND price = item.price
  ORDER BY arrival_date ASC  -- чистый FIFO по дате
)
...
```

**Тестирование:**
1. Создать 2 партии с разными ценами
2. Оформить заказ по новой цене
3. Проверить списание из старой партии

---

#### ✅ Задача 1.2: Добавить триггер sync qty_reserved
**Приоритет:** 🔴 КРИТИЧЕСКИЙ

**Проблема:** `qty_reserved` не очищается при DELETE reservations

**Решение:**
```sql
CREATE OR REPLACE FUNCTION sync_reserved_on_delete()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE stock 
  SET qty_reserved = qty_reserved - OLD.qty
  WHERE product_id = OLD.product_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_reserved_delete
AFTER DELETE ON reservations
FOR EACH ROW
EXECUTE FUNCTION sync_reserved_on_delete();
```

**Тестирование:**
1. Создать резерв вручную
2. Удалить через DELETE
3. Проверить `stock.qty_reserved`

---

#### ✅ Задача 1.3: Проверить логику импорта XLS
**Приоритет:** 🔴 КРИТИЧЕСКИЙ

**Проблема:** qty суммируется вместо замены

**Исследование:**
1. Посмотреть код `/api/import-xls/route.ts`
2. Проверить логику создания `batches`
3. Определить поведение: замена или пополнение?

**Варианты решения:**

**А) Полная замена:**
```sql
-- Деактивировать старые партии
UPDATE batches 
SET is_active = false
WHERE product_id = ? AND arrival_date < ?;

-- Создать новые
INSERT INTO batches (...);
```

**Б) Пополнение (текущая логика):**
```sql
-- Просто добавлять новые партии
INSERT INTO batches (...);
```

---

### 🟡 Фаза 2 — Улучшения (следующий спринт)

#### ✅ Задача 2.1: Клиентский таймер для резервов
**Приоритет:** 🟡 СРЕДНИЙ

**Цель:** Обход ограничения Vercel Hobby (1 cron в день)

**Решение:**
```typescript
// lib/cart-store.ts
useEffect(() => {
  const interval = setInterval(() => {
    // Проверить expires_at резервов
    // Если истёк → удалить из корзины
  }, 60000); // каждую минуту
  
  return () => clearInterval(interval);
}, []);
```

---

#### ✅ Задача 2.2: Автоматическое заполнение inventory_ledger
**Приоритет:** 🟡 СРЕДНИЙ

**Триггеры:**
```sql
-- На подтверждение заказа
CREATE TRIGGER trg_ledger_sale
AFTER UPDATE ON orders
WHEN (NEW.status = 'confirmed')
EXECUTE FUNCTION log_sale_to_ledger();

-- На списание
CREATE TRIGGER trg_ledger_writeoff
AFTER INSERT ON writeoffs
EXECUTE FUNCTION log_writeoff_to_ledger();

-- На импорт
CREATE TRIGGER trg_ledger_import
AFTER INSERT ON batches
EXECUTE FUNCTION log_import_to_ledger();
```

---

#### ✅ Задача 2.3: Low stock alerts
**Приоритет:** 🟡 СРЕДНИЙ

**Реализация:**
1. Добавить `min_stock_threshold` в products
2. Cron проверка раз в день
3. Telegram уведомление менеджеру

```sql
SELECT p.name, s.qty
FROM products p
JOIN stock s ON s.product_id = p.id
WHERE s.qty < p.min_stock_threshold
  AND p.is_active = true;
```

---

### 🟢 Фаза 3 — Расширения (потом)

#### Задача 3.1: Batch expiry (срок годности)
**Приоритет:** 🟢 НИЗКИЙ

```sql
ALTER TABLE batches
ADD COLUMN expiry_date DATE;

CREATE INDEX idx_batches_expiry 
ON batches(expiry_date) 
WHERE is_active = true;
```

---

#### Задача 3.2: Price history VIEW
**Приоритет:** 🟢 НИЗКИЙ

```sql
CREATE VIEW price_history AS
SELECT 
  product_id,
  price,
  arrival_date,
  stock,
  origin
FROM batches
WHERE is_active = true
ORDER BY product_id, arrival_date DESC;
```

---

#### Задача 3.3: Inventory count (инвентаризация)
**Приоритет:** 🟢 НИЗКИЙ

**Таблицы уже есть:**
- `inventory_sessions`
- `inventory_counts`

**Нужно:**
- UI для сканера или ручного ввода
- Автоматическое создание корректировок
- Отчёт по расхождениям

---

## Checklist для разработчика

### Перед деплоем
- [ ] FIFO функция исправлена (убран фильтр по цене)
- [ ] Триггер `sync_reserved_on_delete` создан и протестирован
- [ ] Логика импорта XLS проверена (замена vs пополнение)
- [ ] Cron cleanup работает (хотя бы раз в день)
- [ ] `stock_available` VIEW возвращает корректные данные

### Мониторинг в продакшене
- [ ] Проверять зависшие партии: `SELECT * FROM batches WHERE is_active = true AND stock = 0`
- [ ] Проверять расхождения: `stock.qty != SUM(batches.stock)`
- [ ] Проверять резервы: `qty_reserved != SUM(active reservations)`
- [ ] Проверять oversell: `available_qty < 0`

### SQL для диагностики

```sql
-- Проверка синхронизации stock.qty с batches
SELECT 
  p.name,
  s.qty as stock_qty,
  COALESCE(SUM(b.stock), 0) as batches_sum,
  s.qty - COALESCE(SUM(b.stock), 0) as diff
FROM products p
JOIN stock s ON s.product_id = p.id
LEFT JOIN batches b ON b.product_id = p.id AND b.is_active = true
GROUP BY p.id, p.name, s.qty
HAVING s.qty != COALESCE(SUM(b.stock), 0);

-- Проверка зависших партий
SELECT 
  p.name,
  b.price,
  b.stock,
  b.arrival_date
FROM batches b
JOIN products p ON p.id = b.product_id
WHERE b.is_active = true 
  AND b.stock = 0;

-- Проверка расхождений qty_reserved
SELECT 
  p.name,
  s.qty_reserved as stock_reserved,
  COALESCE(SUM(r.qty), 0) as actual_reserved,
  s.qty_reserved - COALESCE(SUM(r.qty), 0) as diff
FROM products p
JOIN stock s ON s.product_id = p.id
LEFT JOIN reservations r ON r.product_id = p.id AND r.expires_at > now()
GROUP BY p.id, p.name, s.qty_reserved
HAVING s.qty_reserved != COALESCE(SUM(r.qty), 0);

-- Товары с oversell (available_qty < 0)
SELECT 
  p.name,
  sa.available_qty,
  sa.qty,
  sa.qty_reserved,
  sa.reserved_qty
FROM products p
JOIN stock_available sa ON sa.product_id = p.id
WHERE sa.available_qty < 0;
```

---

## Контакты и ссылки

**Проект:** Flowers B2B  
**Репозиторий:** github.com/flowers2account/flowers-b2b  
**Supabase:** jwastcmasactymmzojhi  
**Документация:** [CONTEXT_FOR_NEW_SESSION.md](./CONTEXT_FOR_NEW_SESSION.md)

**Последнее обновление:** 24 мая 2026

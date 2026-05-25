# NAMING SYSTEM — FINAL ARCHITECTURE (25.05.2026)

> Эта версия заменяет все предыдущие версии `NAMING_SYSTEM_STATE.md`.
> Система перестроена под плоскую схему, FIFO удалён.

---

## 🎯 Главные принципы

1. **Плоский products** — никаких batches/stock-таблиц
2. **Партия = product** — каждая партия с уникальной ценой это отдельная карточка
3. **Цена живёт в products** — не в отдельной сущности
4. **Резерв сохранён** — для корзины с TTL 30 мин
5. **NO FIFO** — простое списание `qty -= ordered_qty`
6. **Каждая цена = новая карточка** — UNIQUE (variety, length, country, price)

---

## 📊 Текущая схема `products` (19 полей)

```sql
products (
  -- Идентификация
  id              SERIAL PRIMARY KEY
  
  -- Связи и категория
  variety_id      INTEGER REFERENCES varieties(id)
  category        ENUM (cut/pot)
  subcategory     TEXT                   -- roses/chrysanthemums/lilies/... (для фильтров)
  variety_type    TEXT                   -- single/spray/pompom/... (для фильтров)
  
  -- Имена
  name            TEXT NOT NULL          -- raw из 1С
  display_name    TEXT                   -- автогенерация через триггер
  
  -- Атрибуты товара
  length_cm       INTEGER                -- для cut
  pot_diameter    NUMERIC                -- для pot
  country_iso     TEXT                   -- CN, EC, KE, NL...
  colors          TEXT[]                 -- массив цветов
  image_url       TEXT
  
  -- Учёт партии (встроено)
  qty             INTEGER NOT NULL = 0   -- остаток физический
  price           NUMERIC(10,2)          -- цена за стебель
  arrival_date    DATE                   -- дата прихода
  pack_size       INTEGER NOT NULL = 5   -- кратность заказа
  
  -- Мета
  is_active       BOOLEAN NOT NULL = true
  created_at      TIMESTAMPTZ
  updated_at      TIMESTAMPTZ
)

UNIQUE NULLS NOT DISTINCT (variety_id, length_cm, country_iso, price)
```

### Что значит UNIQUE NULLS NOT DISTINCT

В PostgreSQL по умолчанию `NULL != NULL` в UNIQUE, поэтому могут создаваться дубли с NULL.
`NULLS NOT DISTINCT` исправляет: NULL считается равным NULL → действительно уникально.

Пример:
- `(Эксплоуер, 50, NULL, 420)` × 2 → раньше можно было, теперь UNIQUE
- `(Эксплоуер, 50, CN, 420)` и `(Эксплоуер, 50, CN, 425)` → разные товары, можно

---

## 📊 Связанные таблицы

### varieties (справочник сортов)
```sql
varieties (
  id            SERIAL PRIMARY KEY
  name          TEXT UNIQUE NOT NULL    -- "Эксплоуер"
  species_id    INTEGER → species       -- "Роза одноголовая"
  color         TEXT                    -- legacy, не используем
  origin_country TEXT                   -- legacy, не используем
  flower_type_id INTEGER                -- legacy
  category      TEXT                    -- legacy
  image_url     TEXT
  is_active     BOOLEAN NOT NULL
  created_at    TIMESTAMPTZ
)
```

### species (виды цветов, 25 записей)
```sql
species (
  id            SERIAL PRIMARY KEY
  code          TEXT UNIQUE             -- "rose_large_flowered"
  name_ru       TEXT NOT NULL           -- "Роза одноголовая"
  name_ru_abbrev TEXT                   -- "однг"
  name_en       TEXT
  category      TEXT                    -- "cut" | "pot"
  vbn_group     TEXT                    -- "10101"
)
```

### reservations (резервы корзины)
```sql
reservations (
  id            SERIAL PRIMARY KEY
  product_id    INTEGER → products(id) ON DELETE CASCADE
  order_id      INTEGER → orders(id) ON DELETE CASCADE
  client_id     UUID → auth.users(id)
  qty           INTEGER > 0
  expires_at    TIMESTAMPTZ DEFAULT now() + 30 min
  created_at    TIMESTAMPTZ
)
```

### translation_memory (AI кэш переводов, 127 записей)
```sql
translation_memory (
  id, original, translated, normalized_original,
  species_id, color, country_iso, length_cm,
  cultivar_latin, cultivar_cyrillic,
  product_id, variety_id,                -- связь с витриной (сейчас NULL)
  pack_size, stems_per_pack,
  confidence, source, is_flagged, ...
)
```

---

## 📊 Удалённые сущности

| Что | Почему |
|-----|--------|
| ❌ Таблица `batches` | Партия теперь = product |
| ❌ Таблица `stock` | qty встроен в products |
| ❌ View `stock_available` (старый) | Пересоздан под новую логику |
| ❌ Функция `sync_stock_from_1c` | Не нужна — INSERT/UPDATE прямо в products |
| ❌ Функция `confirm_order_fifo` | FIFO удалён |
| ❌ Поля products: variety_name, length_str, color, origin, pot_size, normalized_slug, previous_price, floral_role, stem_durability, season, stems_per_pack, search_aliases, tags, images, description, campaign_image_url | Дубли/неиспользуемые |

---

## 📊 Восстановлённые сущности

| Что | Зачем |
|-----|-------|
| ✅ `reservations` | Корзина с резервом 30 мин |
| ✅ View `stock_available` | Считает доступное = qty - активные reservations |
| ✅ `pack_size` в products | Кратность заказа |

---

## 🔄 Жизненный цикл товара (новый)

### 1. Импорт XLS из 1С

```
Файл "Срез_база_Китай__16_.xls" (62 строки)

Для каждой строки:
  1. parseNomenclature(name) → {variety_name, length_cm, category}
  2. UPSERT varieties (по name) → variety_id
  3. AI обогащение → species_id для variety, country_iso, colors[]
  4. Ищем product:
     SELECT FROM products 
     WHERE variety_id=X AND length_cm=Y AND country_iso=Z AND price=W
  5a. Найден → UPDATE qty=new_qty, arrival_date=today, is_active=true
  5b. НЕ найден → INSERT новую карточку

После всех строк:
  UPDATE products SET is_active=false 
  WHERE category=... AND id NOT IN (импортированные)
```

### 2. Витрина

```sql
SELECT 
  p.id, p.display_name, p.price, p.pack_size,
  sa.available_qty,
  p.image_url, p.country_iso, p.length_cm
FROM products p
JOIN stock_available sa ON sa.product_id = p.id
WHERE p.is_active = true AND sa.available_qty > 0
```

### 3. Корзина (резерв)

```
Флорист добавил 10 шт в корзину:
  INSERT INTO reservations (product_id, qty, client_id, expires_at)
  VALUES (..., 10, ..., now() + 30 min)

stock_available автоматически уменьшается на 10
```

### 4. Оформление заказа

```
INSERT INTO orders, order_items
UPDATE reservations SET order_id = new_order_id, expires_at = now() + 24h
```

### 5. Подтверждение заказа (без FIFO)

```
UPDATE products SET qty = qty - ordered_qty WHERE id = ...
DELETE FROM reservations WHERE order_id = ...
```

### 6. Cron очистки

```
Раз в день удаляем reservations WHERE expires_at < now()
qty не трогаем (товар физически на складе)
```

---

## 🤖 Display name генерация

### Функция `generate_product_display_name(product_id)`

Функция приоритетно использует `translation_memory.cultivar_cyrillic` через JOIN по `variety_id`.

```
Приоритет 1 (TM есть cultivar_cyrillic):
  species.name_ru + " " + cultivar_cyrillic
  Пример: "Гвоздика Сфт Пинк"
  
Приоритет 2 (есть species, нет TM):
  variety.name → убрать полный prefix species.name_ru
              → убрать type-квалификаторы (одноголовая/ветковая/кустовая/стандарт/спрей)
              → убрать "(страна)" в скобках
  Пример: variety.name="Хризантема ветковая Балтика Пинк" → "Балтика Пинк"
  
Приоритет 3 (нет species):
  INITCAP(variety.name) с удалением "(страна)" в скобках
```

**Что НЕ включается в display_name:**
- Страна (показывается отдельно в карточке)
- Аббревиатуры видов (однг, ветк, спр...)
- Длина стебля (в карточке отдельно)

### Триггер `trg_products_display_name`

```
WHEN: INSERT или UPDATE поля variety_id/country_iso/length_cm/pot_diameter/name
THEN: вызывает generate_product_display_name() и сохраняет в display_name
```

### Связка TM → display_name через variety_id

При импорте XLS `import-xls/route.ts` устанавливает `translation_memory.variety_id` **до** вставки/обновления товара — двумя путями параллельно:
1. По `enriched.translation_memory_id` (AI-запись с полным именем включая длину)
2. По `normalized_original = varNorm` (ручная запись без длины)

Это гарантирует что триггер на INSERT products найдёт TM-запись и сразу сформирует правильный display_name.

---

## 📊 Метрики после rebuild

```
products:           0  (очищено, готово к импорту)
varieties:          0  (очищено)
reservations:       0  (восстановлено как структура)
translation_memory: 127 (сохранено)
species:            25 (сохранено)
characteristic_*:   36 (сохранено)
```

---

## 🔮 Будущее расширение (не сейчас)

### Плантация (когда придёт время)
```sql
-- Новая таблица
CREATE TABLE plantations (
  id SERIAL PRIMARY KEY,
  name TEXT,                  -- "Rosaprima"
  country_iso TEXT,           -- "EC"
  certifications TEXT[]
);

-- Поле в products
ALTER TABLE products ADD COLUMN plantation_id INTEGER REFERENCES plantations(id);

-- Расширить UNIQUE
ALTER TABLE products DROP CONSTRAINT products_natural_key;
ALTER TABLE products ADD CONSTRAINT products_natural_key 
  UNIQUE NULLS NOT DISTINCT (variety_id, length_cm, country_iso, price, plantation_id);
```

### Поставщик (бухгалтерия)
```sql
CREATE TABLE suppliers (
  id SERIAL PRIMARY KEY,
  name TEXT,                  -- "ЛИНФЛАУЭРС"
  type TEXT,                  -- "wholesaler" | "auction" | "direct_farm"
  contacts JSONB
);

ALTER TABLE products ADD COLUMN supplier_id INTEGER REFERENCES suppliers(id);
```

Это **15 минут работы**, делаем когда будут реальные данные.

---

## 🛠 Backup tables (можно удалить через неделю)

```
_backup_products_pre_rebuild           — 655 записей
_backup_varieties_pre_rebuild          — 541 записей
_backup_batches_pre_rebuild            — 5143 записей
_backup_stock_pre_rebuild              — 655 записей
_backup_orders_pre_rebuild             — 21 записей
_backup_order_items_pre_rebuild        — 67 записей
_backup_reservations_pre_rebuild       — 0 записей
_backup_campaign_items_pre_rebuild     — 10 записей
_backup_campaign_orders_pre_rebuild    — 4 записей
_backup_campaign_order_items_pre_rebuild — 12 записей
_backup_inventory_ledger_pre_rebuild   — 113 записей
_backup_writeoffs_pre_rebuild          — 2 записей
_backup_translation_memory_pre_rebuild — 127 записей (восстановлено)
```

Удалить через неделю если всё работает:
```sql
DROP TABLE _backup_products_pre_rebuild;
-- и т.д. для всех _backup_*_pre_rebuild
```

---

## ✅ Статус эндпоинтов на 25.05.2026

| Эндпоинт | Статус |
|----------|--------|
| `/api/import-xls` | ✅ Работает — плоская схема, AI-обогащение, UPSERT variety + product |
| `/api/products` | ✅ Работает — SELECT напрямую из products |
| `/api/facets` | ✅ Работает — динамические счётчики по subcat/varietyType |
| `/api/checkout` | ✅ Работает — INSERT reservations |
| `/api/confirm-order` | ✅ Работает — qty -= ordered_qty |

---

## 📋 Что готово (25.05.2026)

- ✅ Схема products плоская, 19 полей (+ subcategory, variety_type)
- ✅ UNIQUE (variety_id, length_cm, country_iso, price) с NULLS NOT DISTINCT
- ✅ pack_size в products
- ✅ reservations таблица + RLS политики + индексы
- ✅ stock_available VIEW (новая логика)
- ✅ Триггер display_name — использует cultivar_cyrillic из translation_memory
- ✅ Функция generate_product_display_name — 3 приоритета, без страны и аббревиатур
- ✅ translation_memory.variety_id — линкуется при импорте (два пути: по tm_id и по имени сорта)
- ✅ auto_parse_flower_structure — тайbreaker по LENGTH(name_ru) DESC (более специфичный вид побеждает)
- ✅ species: добавлены carnation_standard (id=47) и carnation_spray (id=48)
- ✅ import-xls: автодетект variety_type гвоздик по ключевым словам (ветковая/кустовая/спрей)
- ✅ import-xls: очистка артефактов 1С (пачке Nшт) в parse-nomenclature
- ✅ Динамические фасеты: colorCounts/lengthCounts/originCounts сужаются по subcat+varietyType
- ✅ Цвета в фильтре: тусклые (opacity 0.25) если count=0 в текущей выборке
- ✅ Stop-words в parse-nomenclature: LINFLOWERS/zento/bunch/box/bq убираются из raw-имён
- ✅ country_iso из имени файла при импорте (CN/EC/KE/NL/CO/ET/EG/IL)
- ✅ Страна в каталоге: флаг + название (🇨🇳 Китай) в GridCard, ListRow, DetailPanel
- ✅ translation_memory сохранён
- ✅ Backup_*_pre_rebuild таблицы созданы (можно удалить)

# BUSINESS_LOGIC.md — Бизнес-логика

> Актуально на: 24 мая 2026

---

## 1. Импорт XLS из 1С

### Формат файла
Поддерживаются два формата:
- **Формат 1С**: `[пусто, Наименование, Количество, Цена, Стоимость]`
- **Старый формат**: `[Наименование, Количество, Цена]`

Автоопределение по первой колонке: если пустая → формат 1С.

### Определение категории и источника
По имени файла:
- `горшок`/`горш` → category = `pot`
- `срез` → category = `cut`
- `китай`/`china` → origin = `china`

### Флаги isFirst / isLast

```
Один файл:         isFirst=true, isLast=true
Несколько файлов:  файл 1: isFirst=true, isLast=false
                   файл 2: isFirst=false, isLast=false
                   файл N: isFirst=false, isLast=true
```

**isFirst=true + categoryOverride:**
- Деактивирует ВСЕ партии (`batches.is_active = false`) для всех товаров этой категории
- Stock НЕ обнуляется — накапливается из sync_stock_from_1c
- ⚠️ Только при явной категории в имени файла

**isFirst=true AND isLast=true (одиночный файл) + categoryOverride:**
- После обработки деактивирует товары этой категории, которые НЕ попали в импорт
- `products.is_active = false` для товаров не из текущего файла

**При нескольких файлах:**
- isFirst/isLast НЕ используются для деактивации товаров
- Каждый файл обновляет только свои товары

### Логика обработки строки
```
parseNomenclature(name) → {variety_name, length_cm, length_str, category, origin}
    ↓
UPSERT varieties (by name)
    ↓
SELECT/INSERT/UPDATE products (by variety_id + length_str)
    ├── UPDATE: variety_name, length_cm, is_active=true, previous_price (если цена снизилась)
    └── INSERT: новый товар с pack_size=5
    ↓
sync_stock_from_1c(name, qty, price, today)
    ├── найти product по LOWER(name) или trigram similarity > 0.85
    ├── найти batch по (product_id, price, is_active=true)
    ├── если найден → UPDATE batches SET stock = qty (arrival_date НЕ трогаем)
    ├── если не найден → INSERT новую партию с arrival_date = today
    └── UPSERT stock: qty = SUM(active batches)
    ↓
INSERT inventory_ledger (action='import', qty_before=0, qty_after=qty)
```

### Конфликт цен (один сорт, разные цены)
Если `variety_name + length_str + origin` встречается второй раз с другой ценой (разница > 1) — создаётся отдельный товар с суффиксом `[{price}₸]`:
```
"Red Naomi 60" за 200₸ → variety_name = "Red Naomi"
"Red Naomi 60" за 250₸ → variety_name = "Red Naomi [250₸]"
```

### После всех строк
```
sync_stock_from_batches()  // финальная синхронизация на случай ошибок
```

---

## 2. Жизненный цикл заказа

### Статусы
```
cart → pending → reserved → confirmed → assembling → assembled → delivered
                                      ↘
                                    cancelled
```

| Статус | Кто устанавливает | Что происходит |
|--------|------------------|----------------|
| `cart` | система (default) | пустой заказ |
| `pending` | `/api/checkout` | создаётся резервирование |
| `reserved` | менеджер | подтверждение наличия |
| `confirmed` | менеджер/admin | **триггер trg_order_confirm**: FIFO списание, удаление резервов |
| `assembling` | `/api/orders/[id]/assemble` | начало сборки |
| `assembled` | кассир/менеджер | сборка завершена, фото |
| `delivered` | менеджер | доставлен |
| `cancelled` | клиент/менеджер | **триггер trg_order_cancel**: отмена резервов |

### Триггер trg_order_confirm (AFTER UPDATE orders)
Срабатывает когда `status` меняется на `confirmed`:
1. Вызывает `confirm_order_fifo(order_id)` — FIFO списание
2. Удаляет резервирования заказа

### Триггер trg_order_cancel (AFTER UPDATE orders)
Срабатывает когда `status` меняется на `cancelled`:
1. Вызывает `cancel_order_reservations(order_id)`
2. Удаляет резервирования, пересчитывает qty_reserved

### Триггер trg_order_status_history (AFTER UPDATE orders)
Записывает каждое изменение статуса в `order_history` (append-only).

---

## 3. Система резервирования

### Создание резерва (`/api/checkout`)
1. Проверяет `stock_available.available_qty >= requested_qty`
2. Создаёт запись в `reservations`: `expires_at = now() + 30 min`
3. Обновляет `stock.qty_reserved += qty`
4. Создаёт/обновляет заказ

### Расчёт доступного количества (VIEW `stock_available`)
```sql
available_qty = GREATEST(0, 
  stock.qty 
  - stock.qty_reserved 
  - SUM(reservations.qty WHERE expires_at > now())
)
```

### TTL и очистка
- TTL резервов: **30 минут**
- Очистка: `/api/cron/cleanup` (cron раз в 5 минут)
- Защита эндпоинта: `Authorization: Bearer {CRON_SECRET}`

### ⚠️ Баг: qty_reserved не очищается
Cron удаляет истёкшие `reservations`, но `stock.qty_reserved` не пересчитывается автоматически.  
**Временное решение:** вызывать `sync_stock_reserves()` вручную.  
**Нужно:** триггер AFTER DELETE ON reservations.

---

## 4. FIFO списание (confirm_order_fifo)

При подтверждении заказа функция списывает stock из партий в порядке `arrival_date ASC` (старые сначала).

### ⚠️ Критический баг
```sql
-- ТЕКУЩИЙ КОД (сломанный):
WHERE batches.price = order_items.price

-- ПРАВИЛЬНО:
ORDER BY arrival_date ASC  -- без фильтра по цене
```

При изменении цены партии старые партии "зависают" — FIFO не работает.  
**Статус:** задокументировано, не исправлено.

---

## 5. Роли и доступ

### Роли (`user_role` enum)
| Роль | Доступ |
|------|--------|
| `admin` | Полный доступ: импорт, клиенты, настройки, кампании |
| `manager` | Управление остатками, подтверждение заказов, списания |
| `client` | Каталог, свои заказы, кабинет |

Роли хранятся в `profiles.role`.  
Проверка ролей — на клиенте через `useAuthStore`.  
Серверные проверки auth убраны из API routes.

### Ценовые группы (`price_group` enum)
| Группа | Описание |
|--------|---------|
| `standard` | Обычная цена |
| `vip` | VIP цена |
| `wholesale` | Оптовая цена |

Используется для доступа к кампаниям (`campaigns.allowed_price_groups`).

### Аутентификация
```
Телефон → normalizePhone() → "+7XXXXXXXXXX"
Email для Supabase Auth = phone.replace('+', '') + "@flowers.local"
PIN = пароль Supabase Auth
```

---

## 6. Кампании предзаказов

### Жизненный цикл кампании
```
draft → published → closed → delivered
                  ↘ cancelled
```

| Статус | Описание |
|--------|---------|
| `draft` | Только администратор видит |
| `published` | Открыта для предзаказов клиентами |
| `closed` | Срок истёк (closes_at прошёл) или закрыта вручную |
| `delivered` | Товар поставлен, предзаказы конвертированы |
| `cancelled` | Отменена |

### Процесс
1. Admin создаёт кампанию с `campaign_items` (товары + цены)
2. Кампания публикуется — клиенты с нужной `price_group` видят её
3. Клиенты создают `campaign_orders` с `campaign_order_items`
4. При закрытии/конвертации: `convert_all_campaign_orders(campaign_id)`
   - Для каждого `campaign_order` создаётся обычный `order`
   - `campaign_orders.converted_to_order_id` = ID нового заказа
5. Далее заказы идут по стандартному жизненному циклу

### Автозакрытие
`auto_close_campaigns()` — закрывает кампании где `closes_at < now()`.

---

## 7. AI Переводчик инвойсов

### Назначение
Перевод названий из голландских/китайских инвойсов в русские названия каталога.

### Поток перевода
```
Инвойс (Голландия/Китай)
    ↓
parse-invoice.ts / ai-normalizer.ts
    ↓
Поиск в translation_memory (confidence >= 0.8, approved, not flagged)
    ↓ если не найдено
Gemini API с контекстом из translation_memory_context
    ↓
upsert_translation() → translation_memory
    ↓
Обогащение: species_id, color, country_iso, length_cm (через triggers)
```

### translation_memory_enriched
VIEW строит `display_name_7flowers`:
```
{species.name_ru} {species.name_ru_abbrev} {cultivar} {country.name_ru} {length_cm}
```
Пример: "Роза гр Red Naomi ЭКВАДОР 60"

### ⚠️ Незакрытый gap
`translation_memory` не связана с `products`:
- нет `product_id` в translation_memory
- нет `species_id` в varieties
- Витрина не знает переводы AI переводчика

---

## 8. Инвентаризация

### Поток
1. Создать `inventory_sessions` (открыть сессию)
2. Для каждого товара добавить подсчёты через `/api/inventory/add-count`
3. `inventory_counts.total_counted` = сумма подсчётов
4. `difference` = `total_counted - system_stock` (generated column)
5. Завершить сессию → применить корректировки в `stock`

---

## 9. Списания (writeoffs)

### Поток
1. Менеджер/admin создаёт списание через UI
2. `/api/writeoffs` POST → INSERT writeoffs + UPDATE stock
3. Триггер `after_writeoff_refresh_analytics` → `refresh_writeoffs_analytics()`
4. Telegram уведомление через `/api/telegram/notify-writeoff`
5. Аналитика в VIEW `writeoffs_monitoring`, `writeoffs_report`

---

## 10. Незакрытые критические баги

| # | Баг | Влияние | Код |
|---|-----|---------|-----|
| 1 | FIFO фильтрует по цене | При смене цены старые партии не списываются | `confirm_order_fifo()` |
| 2 | qty_reserved не очищается при DELETE reservations | Oversell после истечения резервов | Нет триггера ON DELETE |
| 3 | varieties.flower_type_id = NULL (541 сорт) | display_name нельзя собрать | import-xls не заполняет |
| 4 | translation_memory не связана с products | AI переводы не используются в витрине | Нет FK |

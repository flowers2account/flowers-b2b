# DATABASE_SCHEMA.md — Схема базы данных

> Supabase project: `jwastcmasactymmzojhi`  
> Актуально на: 24 мая 2026  
> База: PostgreSQL, расширения: `pg_trgm`, `uuid-ossp`

---

## Энумы (custom types)

| Тип | Значения |
|-----|---------|
| `user_role` | `admin`, `manager`, `client` |
| `price_group` | `standard`, `vip`, `wholesale` |
| `client_status` | `active`, `inactive`, `blocked` |
| `product_category` | `cut`, `pot` |
| `order_status` | `cart`, `pending`, `reserved`, `confirmed`, `assembling`, `assembled`, `cancelled`, `delivered` |
| `campaign_type` | `europe`, `china` |
| `campaign_status` | `draft`, `published`, `closed`, `delivered`, `cancelled` |
| `import_status` | `pending`, `processing`, `done`, `error` |
| `ledger_action` | `import`, `sale`, `reserve`, `release`, `adjustment`, `cancel`, `writeoff` |

---

## Витрина (каталог + остатки)

### `flower_types` (10 строк)
Типы цветов: роза, гвоздика, хризантема...

| Колонка | Тип | |
|---------|-----|-|
| `id` | int4 PK | auto |
| `name` | text UNIQUE | |
| `name_en` | text | nullable |
| `sort_order` | int4 | default 0 |
| `created_at` | timestamptz | default now() |

### `varieties` (541 строк) — RLS OFF
Сорта цветов внутри типа (Red Naomi, Freedom...)

| Колонка | Тип | |
|---------|-----|-|
| `id` | int4 PK | auto |
| `flower_type_id` | int4 FK→flower_types | nullable |
| `name` | text UNIQUE | |
| `color` | text | nullable |
| `origin_country` | text | nullable |
| `image_url` | text | nullable |
| `category` | text | default 'cut' |
| `is_active` | bool | default true |
| `created_at` | timestamptz | |

⚠️ `flower_type_id` = NULL у всех 541 сортов — display_name нельзя собрать без заполнения.

### `products` (655 строк) — RLS OFF
Товарные позиции: конкретный сорт + длина + упаковка.

| Колонка | Тип | Описание |
|---------|-----|---------|
| `id` | int4 PK | |
| `variety_id` | int4 FK→varieties | nullable |
| `category` | product_category | default 'cut' |
| `name` | text | raw name из 1С |
| `variety_name` | text | нормализованное название сорта |
| `length_cm` | int4 | nullable |
| `length_str` | text | строковое представление ("60", "60/70") |
| `pack_size` | int4 | default 1 |
| `stems_per_pack` | int4 | nullable; для Китая |
| `unit` | text | default 'шт' |
| `origin` | text | enum: ecuador/kenya/holland/china/local/other/colombia/israel |
| `is_active` | bool | default true |
| `previous_price` | numeric | nullable; заполняется при снижении цены |
| `arrival_date` | date | nullable; дата последней поставки, для бейджа "Новинка" |
| `image_url` | text | nullable |
| `campaign_image_url` | text | nullable; для кампаний предзаказов |
| `color` | text | nullable |
| `colors` | text[] | nullable |
| `normalized_slug` | text | nullable |
| `search_aliases` | text[] | default '{}' |
| `subcategory`, `description`, `tags`, `images` | text/text[] | nullable |
| `variety_type`, `floral_role`, `stem_durability`, `season` | text | nullable |
| `pot_diameter`, `pot_size` | numeric/text | nullable; для горшечных |
| `created_at`, `updated_at` | timestamptz | |

### `stock` (655 строк, UNIQUE product_id) — RLS OFF
Текущие остатки — главная точка правды.

| Колонка | Тип | Описание |
|---------|-----|---------|
| `id` | int4 PK | |
| `product_id` | int4 UNIQUE FK→products | |
| `price` | numeric | default 0 |
| `qty` | int4 | остаток (≥0), CHECK qty >= 0 |
| `qty_reserved` | int4 | резерв системы; ⚠️ не очищается при DELETE reservations |
| `is_available` | bool | default true |
| `updated_at` | timestamptz | |

### `batches` (5084 строк) — RLS OFF
Партии для FIFO по дате прихода.

| Колонка | Тип | Описание |
|---------|-----|---------|
| `id` | int4 PK | |
| `product_id` | int4 FK→products | |
| `price` | numeric | цена партии |
| `stock` | int4 | остаток в партии, default 0 |
| `stock_reserved` | int4 | резерв в партии, default 0 |
| `arrival_date` | date | дата прихода, default CURRENT_DATE |
| `is_active` | bool | false = партия списана |
| `origin` | text | enum: ecuador/kenya/holland/china/local/other |
| `farm` | text | nullable |
| `created_at` | timestamptz | |

### `reservations` (0 строк) — RLS OFF
Активные резервы товара под заказы. TTL: 30 минут.

| Колонка | Тип | |
|---------|-----|-|
| `id` | int4 PK | |
| `product_id` | int4 FK→products | |
| `order_id` | int4 FK→orders | nullable |
| `user_id` | uuid FK→auth.users | nullable |
| `qty` | int4 CHECK > 0 | |
| `expires_at` | timestamptz | default now() + 30 min |
| `created_at` | timestamptz | |

---

## Заказы

### `orders` (21 строка) — RLS OFF

| Колонка | Тип | |
|---------|-----|-|
| `id` | int4 PK | |
| `client_id` | uuid FK→clients | nullable (гость) |
| `status` | order_status | default 'cart' |
| `total` | numeric | |
| `notes` | text | nullable |
| `confirmed_by` | uuid FK→profiles | nullable |
| `confirmed_at` | timestamptz | nullable |
| `payment_method`, `payment_comment` | text | nullable |
| `assembly_photo_url` | text | nullable |
| `assembled_at`, `assembled_by` | timestamptz/uuid | nullable |
| `guest_phone`, `guest_name` | text | nullable |
| `created_at`, `updated_at` | timestamptz | |

### `order_items` (67 строк) — RLS OFF

| Колонка | Тип | |
|---------|-----|-|
| `id` | int4 PK | |
| `order_id` | int4 FK→orders | |
| `product_id` | int4 FK→products | |
| `qty` | int4 CHECK > 0 | |
| `qty_ordered` | int4 | nullable; оригинальное кол-во |
| `qty_actual` | int4 | nullable; фактически собранное |
| `price` | numeric | цена на момент заказа |
| `assembly_note` | text | nullable |
| `is_removed` | bool | default false |
| `created_at` | timestamptz | |

### `order_history` (169 строк) — RLS OFF
Журнал изменений статуса заказа.

| Колонка | Тип | |
|---------|-----|-|
| `id` | int8 PK | |
| `order_id` | int4 FK→orders | |
| `status_from` | text | nullable |
| `status_to` | text | |
| `changed_by` | uuid FK→auth.users | nullable |
| `note` | text | nullable |
| `snapshot` | jsonb | nullable |
| `created_at` | timestamptz | |

---

## Клиенты

### `profiles` (125 строк) — RLS ON
1:1 с auth.users.

| Колонка | Тип | |
|---------|-----|-|
| `id` | uuid PK FK→auth.users | |
| `email` | text | |
| `role` | user_role | default 'client' |
| `full_name`, `display_name` | text | nullable |
| `phone` | text | nullable |
| `company_name` | text | nullable |
| `price_group` | price_group | default 'standard' |
| `is_active` | bool | default true |
| `created_at`, `updated_at` | timestamptz | |

### `clients` (123 строки) — RLS OFF
Расширенные B2B данные клиентов.

| Колонка | Тип | |
|---------|-----|-|
| `id` | uuid PK | gen_random_uuid() |
| `auth_user_id` | uuid FK→auth.users | nullable |
| `name`, `company_name` | text | nullable |
| `phone` | text | nullable |
| `pin` | text | nullable |
| `bin` | text | nullable (БИН) |
| `city`, `address` | text | nullable |
| `credit_limit` | numeric | default 0 |
| `status` | client_status | default 'active' |
| `manager_id` | uuid FK→profiles | nullable |
| `notes` | text | nullable |
| `created_at`, `updated_at` | timestamptz | |

### `price_rules` (0 строк) — RLS ON
Индивидуальные цены по группам клиентов.

| Колонка | Тип | |
|---------|-----|-|
| `id` | int4 PK | |
| `product_id` | int4 FK→products | |
| `price_group` | price_group | |
| `price` | numeric | |
| `valid_from`, `valid_to` | date | nullable |
| `created_at` | timestamptz | |

---

## Кампании предзаказов

### `campaigns` (6 строк) — RLS ON

| Колонка | Тип | |
|---------|-----|-|
| `id` | int4 PK | |
| `title` | text | |
| `type` | campaign_type | default 'europe' |
| `description` | text | nullable |
| `closes_at` | timestamptz | дедлайн сбора заказов |
| `delivery_date` | date | ожидаемая дата поставки |
| `status` | campaign_status | default 'draft' |
| `allowed_price_groups` | text[] | default ['vip','wholesale'] |
| `created_by` | uuid FK→profiles | nullable |
| `created_at`, `updated_at` | timestamptz | |

### `campaign_items` (10 строк) — RLS ON
Позиции в каталоге кампании.

| Колонка | Тип | |
|---------|-----|-|
| `id` | int4 PK | |
| `campaign_id` | int4 FK→campaigns | |
| `product_id` | int4 FK→products | |
| `price` | numeric CHECK >= 0 | |
| `min_qty` | int4 | default 1 |
| `pack_size` | int4 | default 1 |
| `sort_order` | int4 | default 0 |
| `is_active` | bool | default true |
| `notes` | text | nullable |
| `created_at` | timestamptz | |

### `campaign_orders` (4 строки) — RLS ON
Предзаказы клиентов.

| Колонка | Тип | |
|---------|-----|-|
| `id` | int4 PK | |
| `campaign_id` | int4 FK→campaigns | |
| `client_id` | uuid | nullable |
| `guest_phone`, `guest_name` | text | nullable |
| `status` | order_status | default 'pending' |
| `total` | numeric | |
| `notes` | text | nullable |
| `converted_to_order_id` | int4 FK→orders | nullable; после конвертации |
| `created_at`, `updated_at` | timestamptz | |

### `campaign_order_items` (12 строк) — RLS ON

| Колонка | Тип | |
|---------|-----|-|
| `id` | int4 PK | |
| `campaign_order_id` | int4 FK→campaign_orders | |
| `campaign_item_id` | int4 FK→campaign_items | |
| `qty` | int4 CHECK > 0 | |
| `price` | numeric | |
| `created_at` | timestamptz | |

---

## AI Переводчик

### `species` (25 строк) — RLS OFF
Справочник видов цветов (Rosa, Chrysanthemum...).

| Колонка | Тип | |
|---------|-----|-|
| `id` | int4 PK | |
| `code` | text UNIQUE | |
| `name_en`, `name_ru` | text | |
| `name_ru_abbrev` | text | nullable |
| `vbn_group` | text | nullable |
| `category` | text | cut/pot/garden |
| `created_at` | timestamptz | |

### `translation_memory` (127 строк) — RLS ON
Одобренные переводы накладных для AI.

| Колонка | Тип | Описание |
|---------|-----|---------|
| `id` | uuid PK | gen_random_uuid() |
| `original` | text | оригинал из накладной |
| `normalized_original` | text | lowercase, без пробелов |
| `translated` | text | переведённое название |
| `normalized_translated` | text | nullable |
| `category` | text | cut/pot |
| `confidence` | numeric | 0–1 |
| `source` | text | ai/manual/rule_based |
| `approved_by` | uuid FK→profiles | nullable |
| `approved_at` | timestamptz | |
| `usage_count` | int4 | default 1 |
| `last_used_at` | timestamptz | |
| `is_flagged` | bool | default false; ошибочные переводы |
| `flagged_reason` | text | nullable |
| `flagged_by`, `flagged_at` | uuid/timestamptz | nullable |
| `species_id` | int4 FK→species | nullable |
| `cultivar_latin`, `cultivar_cyrillic` | text | nullable |
| `species_type` | text | nullable |
| `color` | text | nullable |
| `country_iso` | text | nullable |
| `length_cm` | int4 | nullable |
| `created_at` | timestamptz | |

### `characteristic_colors` (14 строк) — Floricode S50
### `characteristic_countries` (13 строк) — Floricode S62
### `characteristic_lengths` (9 строк) — Floricode S20
### `stop_words` (17 строк) — стоп-слова парсера накладных
### `search_synonyms` (34 строки) — словарь синонимов поиска

---

## Операционные таблицы

### `inventory_ledger` (54 строки) — RLS OFF
Append-only журнал всех изменений остатков.

| Колонка | Тип | |
|---------|-----|-|
| `id` | int8 PK | |
| `product_id` | int4 FK→products | |
| `action` | ledger_action | import/sale/reserve/... |
| `quantity` | int4 | дельта |
| `qty_before` | int4 NOT NULL | |
| `qty_after` | int4 NOT NULL | |
| `reference_type` | text | nullable |
| `reference_id` | int4 | nullable |
| `created_by` | uuid FK→profiles | nullable |
| `notes` | text | nullable |
| `created_at` | timestamptz | |

### `writeoffs` (2 строки) — RLS OFF

| Колонка | Тип | |
|---------|-----|-|
| `id` | int8 PK | |
| `product_id` | int4 FK→products | |
| `quantity` | int4 CHECK > 0 | |
| `reason` | text | nullable |
| `photo_url` | text | nullable |
| `created_by` | uuid FK→profiles | nullable |
| `created_at` | timestamptz | |

### `inventory_sessions` + `inventory_counts`
Для инвентаризации: сессия → список подсчётов.  
`inventory_counts.difference` — generated column: `total_counted - system_stock`.

### `imports` — RLS ON
Журнал загрузок XLS (пока не используется в коде).

### `app_settings`
Пары key/value для конфигурации.

---

## Представления (Views)

### `stock_available`
Доступный остаток для клиента.
```sql
available_qty = GREATEST(0, qty - qty_reserved - SUM(active reservations))
```

### `campaign_summary`
Агрегат campaign_items + активные предзаказы: qty_ordered, orders_breakdown.

### `translation_memory_context`
Фильтр для AI: approved_by IS NOT NULL AND is_flagged = false AND confidence >= 0.8

### `translation_memory_enriched`
Объединяет translation_memory + species + characteristic_countries.  
Поле `display_name_7flowers` — готовое название для витрины.

### `writeoffs_monitoring`
Списания с расчётом `loss_amount = quantity * price`.

### `writeoffs_report`
Детальный отчёт по списаниям.

---

## Триггеры

| Таблица | Триггер | Событие | Функция |
|---------|---------|---------|---------|
| orders | `trg_order_confirm` | AFTER UPDATE | `trg_confirm_order()` — списывает stock по FIFO |
| orders | `trg_order_cancel` | AFTER UPDATE | `trg_cancel_reservations()` — отменяет резервы |
| orders | `trg_order_delete` | BEFORE DELETE | `trg_delete_order_reservations()` — удаляет резервы |
| orders | `trg_order_status_history` | AFTER UPDATE | `log_order_status_change()` → order_history |
| orders | `set_updated_at_orders` | BEFORE UPDATE | `trigger_set_updated_at()` |
| clients | `set_updated_at_clients` | BEFORE UPDATE | `trigger_set_updated_at()` |
| products | `set_updated_at_products` | BEFORE UPDATE | `trigger_set_updated_at()` |
| profiles | `set_updated_at_profiles` | BEFORE UPDATE | `trigger_set_updated_at()` |
| stock | `set_updated_at_stock` | BEFORE UPDATE | `trigger_set_updated_at()` |
| campaigns | `trg_campaigns_updated_at` | BEFORE UPDATE | `update_campaigns_updated_at()` |
| campaign_orders | `trg_campaign_orders_updated_at` | BEFORE UPDATE | `update_campaigns_updated_at()` |
| translation_memory | `trg_set_normalized_original` | BEFORE INSERT/UPDATE | `set_normalized_original()` |
| translation_memory | `trg_normalize_translated` | BEFORE INSERT/UPDATE | `normalize_translated_text()` |
| translation_memory | `trg_auto_parse_structure` | BEFORE INSERT/UPDATE | `auto_parse_flower_structure()` |
| writeoffs | `after_writeoff_refresh_analytics` | AFTER INSERT | `trigger_refresh_writeoffs_analytics()` |

---

## Функции (бизнес-логика)

### Импорт и остатки
| Функция | Аргументы | Описание |
|---------|-----------|---------|
| `sync_stock_from_1c` | name, new_qty, new_price, arrival_date | Поиск товара → поиск партии по цене → UPDATE/INSERT; возвращает jsonb |
| `sync_stock_from_batches` | — | Синхронизирует `stock.qty = SUM(batches.stock WHERE is_active)` |
| `sync_stock_reserves` | — | Пересчитывает `qty_reserved` из активных резервов |
| `confirm_order_fifo` | order_id | FIFO списание при подтверждении заказа ⚠️ баг: WHERE price = item.price |
| `cancel_order_reservations` | order_id | Отменяет все резервы заказа |

### Поиск и нейминг
| Функция | Описание |
|---------|---------|
| `expand_search_query(text)` | Расширяет запрос синонимами из search_synonyms |
| `parse_flower_name(name)` → jsonb | Парсит название цветка в компоненты |
| `normalize_text(text)` | lowercase + trim |
| `translit(text)`, `transliterate_to_slug(text)` | Транслитерация |
| `search_products_for_writeoff(query)` | Поиск товаров для списания |

### Кампании
| Функция | Описание |
|---------|---------|
| `convert_campaign_order_to_order(id)` → int | Конвертирует предзаказ в обычный заказ |
| `convert_all_campaign_orders(campaign_id)` | Конвертирует все предзаказы кампании |
| `auto_close_campaigns()` | Закрывает кампании с closes_at < now() |
| `get_campaign_stats(id)` | Статистика кампании |
| `get_campaign_summary(id)` | Сводка кампании |

### AI переводчик
| Функция | Описание |
|---------|---------|
| `upsert_translation(...)` | Добавляет/обновляет запись в translation_memory |
| `extract_cultivar_from_translation(translated, species)` | Извлекает сортовое название |
| `enrich_synonyms_from_translations()` | Пополняет search_synonyms из переводов |
| `apply_enriched_synonyms()` | Применяет обогащённые синонимы |

### Роли
| Функция | Описание |
|---------|---------|
| `is_admin()` | true если role = 'admin' |
| `is_admin_or_manager()` | true если role IN ('admin','manager') |
| `get_my_role()` | Возвращает роль текущего пользователя |

### Аналитика
| Функция | Описание |
|---------|---------|
| `get_writeoff_stats(start, end)` | Статистика списаний за период |
| `get_top_writeoff_products(days, n)` | Топ N товаров по списаниям |
| `check_reserve_sync()` | Диагностика расхождений резервов |

---

## FK Карта (ключевые связи)

```
auth.users ──┬── profiles (1:1)
             └── clients.auth_user_id

flower_types ── varieties ── products ──┬── stock (1:1)
                                        ├── batches (1:N)
                                        ├── order_items (N:M через orders)
                                        ├── reservations
                                        ├── inventory_ledger
                                        ├── writeoffs
                                        └── campaign_items

clients ── orders ── order_items
                  └── order_history
                  └── reservations

campaigns ── campaign_items ── campaign_order_items
          └── campaign_orders ──────────────────────┘
                            └── converted_to_order_id → orders

species ── translation_memory ── characteristic_countries
```

---

## RLS статус

**RLS включён:** `profiles`, `flower_types`, `price_rules`, `imports`, `campaigns`, `campaign_items`, `campaign_orders`, `campaign_order_items`, `translation_memory`

**RLS отключён (намеренно):** все остальные таблицы. Безопасность обеспечивается через API routes с проверкой роли из `useAuthStore`.

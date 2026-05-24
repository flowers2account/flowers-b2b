# Flowers B2B — База знаний

> Актуально на: 24 мая 2026  
> Supabase project: `jwastcmasactymmzojhi`

Документы покрывают все ключевые подсистемы проекта. Читай перед началом работы с фичей.

---

## Навигация

| Документ | Что описывает | Когда читать |
|----------|--------------|--------------|
| [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) | Все таблицы, views, триггеры, функции, FK карта | Перед любой работой с БД |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Стек, структура папок, API роуты, Zustand сторы | При добавлении новых фич, навигации по коду |
| [BUSINESS_LOGIC.md](./BUSINESS_LOGIC.md) | Импорт XLS, жизненный цикл заказа, резервы, FIFO, кампании | При работе с бизнес-логикой |
| [IMPORT_SYSTEM.md](./IMPORT_SYSTEM.md) | Импорт XLS из 1С, функция `sync_stock_from_1c`, логика партий | Детали импорта, партий, XLS |
| [STOCK_MANAGEMENT.md](./STOCK_MANAGEMENT.md) | Архитектура остатков: stock/batches/reservations, FIFO, баги | Детали остатков, заказов, резервов |
| [STOCK_QUICK_REF.md](./STOCK_QUICK_REF.md) | Быстрый справочник: таблицы, баги, SQL диагностика | Быстрая шпаргалка при дебаге |
| [AI_TRANSLATOR.md](./AI_TRANSLATOR.md) | AI-переводчик инвойсов: translation_memory, species, справочники | При работе с переводами, импортом накладных |
| [NAMING_SYSTEM_STATE.md](./NAMING_SYSTEM_STATE.md) | Состояние нейминга: дубли, дырки в данных, план интеграции | При работе с каталогом, нормализацией имён |
| [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) | Известные баги с описанием и исправлениями | При дебаге, планировании спринта |
| [ROADMAP.md](./ROADMAP.md) | Планы развития по этапам, история выполненного | При планировании работ |

---

## Архитектура в одной схеме

```
Две изолированные подсистемы (пока не связаны):

┌─────────────────────────────────┐    ┌──────────────────────────────────────┐
│  ВИТРИНА                        │    │  AI-ПЕРЕВОДЧИК                       │
│                                 │    │                                      │
│  products ←→ varieties          │    │  translation_memory                  │
│  batches (партии, FIFO)         │    │  species (25 видов)                  │
│  stock (агрегат по товару)      │    │  characteristic_colors/countries     │
│  stock_available (VIEW)         │    │  stop_words                          │
│  reservations (TTL 30 мин)      │    │                                      │
│                                 │    │  ❌ нет product_id/variety_id        │
│  sync_stock_from_1c()           │    │  ❌ нет varieties.species_id         │
│  confirm_order_fifo()           │    │                                      │
└─────────────────────────────────┘    └──────────────────────────────────────┘
```

---

## Критические баги (незакрытые)

| # | Баг | Функция | Приоритет |
|---|-----|---------|-----------|
| 1 | FIFO ломается при смене цены | `confirm_order_fifo()` — `WHERE price = item.price` | 🔴 |
| 2 | `qty_reserved` не очищается после DELETE reservations | Нет триггера на DELETE | 🔴 |
| 3 | `varieties.species_id` = NULL у всех 541 сортов | display_name нельзя собрать | 🟡 |
| 4 | `translation_memory` не связана с `products` | AI переводит, но витрина не знает | 🟡 |

---

## Что сделано (хронология)

| Дата | Изменение |
|------|-----------|
| 24.05.2026 | Исправлен `import-xls` — использует `sync_stock_from_1c` вместо прямого INSERT |
| 23.05.2026 | Исправлен `sync_stock_from_1c` — нет дублей партий, arrival_date сохраняется |
| 23.05.2026 | Очищено 52 группы дублей партий (54 деактивировано) |
| 20.05.2026 | AI-переводчик v1.1: справочники species/colors/countries, формат 7flowers |

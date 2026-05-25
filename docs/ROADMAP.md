# ROADMAP.md — Планы развития

> Актуально на: 25 мая 2026

---

## 🔴 Этап 1 — Критические баги

| # | Задача | Файл | Статус |
|---|--------|------|--------|
| 1 | Исправить FIFO — убрать `WHERE price = item.price` | `confirm_order_fifo()` | ✅ FIFO удалён при rebuild |
| 2 | Добавить триггер на DELETE reservations → пересчёт qty_reserved | Supabase migration | ✅ stock_available VIEW |
| 3 | Починить checkout в DetailPanel | `DetailPanel.tsx` | ✅ Исправлено |
| 4 | Иконка корзины в хедере не открывает панель | Header | ✅ Исправлено |
| 5 | Синхронизация PIN при смене в AdminTable | `AdminTable.tsx` + `/api/client/change-pin` | ✅ Исправлено |

---

## 🟡 Этап 2 — Нормализация каталога (до масштабирования)

| # | Задача | Описание | Статус |
|---|--------|---------|--------|
| 5 | Поле `display_name` в products | Чистое название через триггер + cultivar_cyrillic из TM | ✅ Готово |
| 6 | Stop-words в импорте XLS | Убирать LINFLOWERS/zento/2кор/оф/bunch/box из названий при парсинге | ✅ Готово |
| 7 | Страна в карточке каталога | Флаг + название страны в GridCard, ListRow, DetailPanel | ✅ Готово |
| 8 | Определение страны из имени файла | Импорт: country_iso из имени файла (Китай, Эквадор, Кения...) | ✅ Готово |
| 9 | Импорт инвойса Голландии (.xlsx) | Автозаполнение color/farm/image_url из инвойса 7flowers | ⬜ Не начато |

---

## 🟡 Этап 3 — Связка AI переводчика с витриной

| # | Задача | Описание | Статус |
|---|--------|---------|--------|
| 10 | `species_id` в `varieties` | Связь сорта с видом (Rosa, Chrysanthemum...) | ✅ Готово |
| 11 | `product_id`/`variety_id` в `translation_memory` | Связь перевода с товаром при импорте | ✅ Готово |
| 12 | `display_name` из TM в каталоге | cultivar_cyrillic через variety_id → триггер → display_name | ✅ Готово |
| 13 | Страна из имени товара при импорте | Для позиций без страны в имени файла | ⬜ Отложено |

---

## 🟢 Следующий спринт

| # | Задача | Описание |
|---|--------|---------|
| 14 | Realtime обновления каталога | Realtime подписка на `products` (не `stock` — таблица удалена) |
| 15 | Личный кабинет | История заказов с деталями для клиента |
| 16 | Таймер резервов | Показывать обратный отсчёт 30 мин в корзине |
| 17 | Фото товаров | Автозагрузка из 7flowers или ручная загрузка в /admin |
| 18 | Low stock alerts | Уведомление менеджеру при qty < порога |

---

## ⏸ Отложено до масштабирования

| Задача | Причина откладывания |
|--------|---------------------|
| Таблица aliases (raw_name → product_id) | Нужно больше данных для обучения |
| Полный dictionary pipeline | Зависит от заполнения species_id |
| AI matching названий при импорте | Работает через translation_memory, но не связано с витриной |
| Batch expiry (срок годности цветов) | Нет требования сейчас |
| Price history VIEW | Нужна история цен, пока только `previous_price` |
| Inventory count UI (полная инвентаризация) | Базовый UI есть, нужна доработка |
| RLS на всех таблицах | Сейчас безопасность через API routes |

---

## ✅ Сделано

| Дата | Что сделано |
|------|------------|
| 25.05.2026 | Страна в карточке: флаг + название (🇨🇳 Китай) в GridCard, ListRow, DetailPanel |
| 25.05.2026 | Страна из имени файла при импорте — покрывает CN/EC/KE/NL/CO/ET/EG/IL |
| 25.05.2026 | Stop-words в parse-nomenclature — LINFLOWERS/zento/bunch/box/bq убираются из названий |
| 25.05.2026 | Динамические фасеты — colorCounts/lengthCounts/originCounts сужаются по subcat+varietyType |
| 25.05.2026 | Цвета в фильтре: dim (opacity 0.25) если нет товаров в текущей выборке |
| 25.05.2026 | display_name: подключён cultivar_cyrillic из translation_memory через variety_id |
| 25.05.2026 | auto_parse_flower_structure: тайbreaker LENGTH(name_ru) DESC — специфичный вид побеждает |
| 25.05.2026 | Гвоздика: добавлены species carnation_standard (47) и carnation_spray (48), автодетект variety_type |
| 25.05.2026 | parse-nomenclature: очистка артефактов 1С `(пачке Nшт)` |
| 25.05.2026 | Rebuild БД — плоская схема products, удалены batches/stock/FIFO |
| 24.05.2026 | Создана база знаний docs/ (8 файлов) |
| 20.05.2026 | AI-переводчик v1.1 — справочники species/colors/countries |
| 09.05.2026 | Система кампаний (предзаказы Голландия/Китай) |
| 07.05.2026 | DetailPanel, мобильная адаптация каталога, фильтры |
| 02.05.2026 | Редизайн: двухуровневый хедер, FilterSidebar, ProductCard |
| 01.05.2026 | Авторизация телефон+PIN, защита /admin, Supabase Auth |
| 30.04.2026 | Гостевые заказы, уведомления Telegram/WhatsApp |

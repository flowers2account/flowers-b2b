# KNOWN_ISSUES.md — Известные баги

> Актуально на: 24 мая 2026

---

## 🔴 Критические (блокируют функциональность)

### 1. FIFO ломается при смене цены
**Файл:** `confirm_order_fifo()` (Supabase функция)  
**Проблема:** `WHERE batches.price = order_items.price` — при изменении цены старые партии не списываются.  
**Последствие:** Товар числится на складе, но FIFO его не видит.  
**Исправление:** Убрать фильтр по цене, оставить только `ORDER BY arrival_date ASC`.

### 2. qty_reserved не очищается при истечении резервов
**Файл:** `/api/cron/cleanup`, таблица `stock`  
**Проблема:** Cron удаляет строки из `reservations`, но `stock.qty_reserved` не пересчитывается.  
**Последствие:** `available_qty` занижается — клиент не может заказать фактически доступный товар.  
**Исправление:** Добавить триггер `AFTER DELETE ON reservations` или вызывать `sync_stock_reserves()` в cron.

### 3. checkout не работает в DetailPanel
**Файл:** `src/components/catalog/DetailPanel.tsx`  
**Проблема:** Корзина в правой панели не отправляет заказ.

### 4. PIN не синхронизируется при смене в AdminTable
**Файл:** `src/components/admin/AdminTable.tsx`  
**Проблема:** Изменение PIN в UI не обновляет запись в Supabase Auth — пользователь не может войти с новым PIN.

---

## 🟡 Некритические

### 5. varieties.flower_type_id = NULL у всех 541 сортов
**Проблема:** `varieties.flower_type_id` не заполняется при импорте XLS.  
**Последствие:** `display_name_7flowers` из VIEW `translation_memory_enriched` не работает без species_id.

### 6. translation_memory не связана с products
**Проблема:** Нет `product_id`/`variety_id` в `translation_memory`, нет `species_id` в `varieties`.  
**Последствие:** AI переводит накладные, но витрина не использует эти переводы.

### 7. Иконка корзины в хедере не открывает панель на десктопе
**Файл:** хедер, `detail-store.ts`

### 8. Realtime обновления каталога не работают
**Файл:** `PriceTable.tsx`  
**Проблема:** Цены не обновляются без перезагрузки страницы.  
**Временное решение:** Перезагрузить страницу.

### 9. WhatsApp уведомление требует разрешение всплывающих окон
**Решение для пользователя:** Разрешить popup'ы для сайта в настройках браузера.

---

## ⚙️ Архитектурные ограничения (не баги, но важно знать)

### SUPABASE_SERVICE_ROLE_KEY не работает на Vercel serverless
**Причина:** Переменная недоступна в serverless-контексте Vercel.  
**Решение:** Используется `createClient()` (client role) + RLS политики.  
**Статус:** Постоянное ограничение — НЕ добавлять service role key в Vercel Settings.

# PROJECT_STATUS.md — Flowers B2B

> **Обновлено:** 2026-06-26 (сверено с живым кодом и БД).  
> История изменений по сессиям — в `CLAUDE.md` и git log. Здесь — снимок «что работает / что болит / куда дальше».

## Что работает (production)

### Каталог и заказы
- ✅ Каталог 3 категорий (`cut`/`pot`/`accessories`), витрина = `is_active AND source IN ('uralsk_site','uralsk_1c')`.
- ✅ Плоская модель остатков (`products.qty`), резервы 30 мин (`reservations`), view `stock_available`.
- ✅ Корзина (Zustand `cart-store`, persist), оформление заказа гостем (по телефону) и клиентом.
- ✅ Выбор цвета как ярлык (`order_items.color`), палитра `src/lib/colors.ts`.
- ✅ Серверный поиск (`/api/search` → RPC `search_products`), фасеты (`/api/facets`).
- ✅ Жизненный цикл заказа: `cart → pending → reserved → confirmed → assembling → assembled → delivered` (+ `cancelled`, + преордерные `in_transit`/`arrived`, + `negotiation`). Сборка/корректировка/выдача в `/admin`.

### Оплата и счета
- ✅ Оплата ePay/Halyk (тестовый контур): `/api/payments/init` → checkout → `/api/payments/postlink`; уведомления (Telegram+WhatsApp) только после подтверждения оплаты.
- ✅ Реестр банка `/admin/payments` (`payments`, `payment_operations`).
- ✅ Счета на оплату (`invoices`, нумерация с 9000001).
- ⏳ Ждём боевые ключи Halyk + DNS (`uralskflowers.kz`).

### Предзаказы
- ✅ Закрытые комнаты-кампании OZ (вход по коду), pricing EUR→KZT, стейджинг, сборка/выдача, конвертация в заказы. Активных кампаний в БД: 1.

### AI / интеграции
- ✅ AI-виджет-консультант на сайте (история в `conversations`/`messages`), анонимные обращения → amoCRM «Обращения с сайта».
- ✅ Umnico-бот расходки (WhatsApp), цепочка уведомлений менеджеру + кладовщику.
- ✅ AI-перевод названий (`translation_memory`, Gemini), `display_name` через триггер.
- ✅ amoCRM: лиды/контакты/этапы для заказов и предзаказов.
- ✅ Яндекс.Метрика (110078269) в SPA-режиме, блок «Трафик» в `/admin/stats`.

### Импорт / каталог поставщиков
- ✅ Импорт XLS из 1С (staging `stock_import_rows` → апрув → `products`), категория по имени файла.
- ✅ 1С-интеграция `/api/integrations/1c/stock` (snapshot, авто-матч по коду/алиасу/имени).
- ✅ Сбор каталогов OZ/Waterdrinker (карточки `source='oz_catalog'/'waterdrinker'`, `is_active=false` до прихода в 1С).
- ✅ Инвентаризация и списания (`writeoffs`, `inventory_*`).

### Инфраструктура
- ✅ Прод на VPS (pm2/nginx), деплой push→main через GitHub Actions.
- ✅ RLS включён на ~24 таблицах (роллаут июнь).
- ✅ Самохостинг фото на VPS (часть) + Supabase Storage.

## Снимок данных (на 26.06.2026)

- `products`: 8181 всего, 4709 активных, 4708 с остатком > 0.
- По источникам: `oz_catalog` 5158, `waterdrinker` 1124, `uralsk_1c` 1051, `uralsk_site` 651, `null` 183, `oz_preorder` 10, `oz_export` 3, `1c_manual` 1.
- Активная витрина (`uralsk_site`+`uralsk_1c`): 719 товаров.
- `orders`: 43 · `campaigns`: 1 · `translation_memory`: 453.

## Known issues / риски (см. `DOCS_AUDIT_REPORT.md` §5)

### 🟠 Безопасность / авторизация
- Многие мутирующие роуты на `createAdminClient()` (service-role) **без проверки сессии/роли** (`/api/checkout`, `/api/manager-order`, `/api/orders/[id]`, `/api/campaigns` root/PATCH/DELETE, `/api/payments/postlink`). Защита — серверность + неочевидность. Нужен auth-аудит до публичного запуска.
- SECURITY DEFINER RPC (`admin_*`, `get_admin_preorders`, `get_preorder_room`) открыты для anon; защита — клиентский гард `/admin`.
- `favorites` без RLS; PIN хранится открытым текстом в `clients.pin`.

### 🟡 Данные / БД
- Мёртвые функции `sync_stock_from_1c` / `sync_stock_from_batches` / `sync_stock_reserves` ссылаются на удалённые `stock`/`batches` — кандидаты на DROP.
- Backup-таблицы в `public` (`_backup_*_pre_rebuild`, `products_backup_*`, `*_backup_dedup_*`, `dedup_mapping_*`) — мусор, висят в проде.
- `app_settings.oz_target_departure_date = 2026-06-18` — в прошлом → риск рассинхрона OZ-цен/наличия (`oz_price_deactivate_enabled=false` снижает урон).
- `confirm_order_fifo` — имя историческое, FIFO нет (простое списание). Переименовать/документировать.
- `order_status` содержит незадокументированное `negotiation` (нет в маппинге amoCRM).

### 🟢 Прочее
- Realtime обновления каталога не работают — нужна перезагрузка страницы.
- WhatsApp-уведомление требует разрешения всплывающих окон.

## Roadmap (актуальные направления)

1. **Auth-аудит API** — закрыть write-роуты и SECURITY DEFINER RPC ролевыми проверками.
2. **Маппинг 1С → каталог** — таблица алиасов `raw_name → product_id` (частично есть `stock_aliases`); первичная привязка через UI + AI.
3. **Боевая оплата Halyk** — ключи + DNS `uralskflowers.kz` + certbot.
4. **Чистка БД** — DROP мёртвых функций и backup-таблиц, ревизия `negotiation`.
5. **Переводы OZ-товаров** — `display_name` для англоязычных карточек.
6. **Нормализация дублей** — слияние товаров с одним сортом, разными `name`.
</content>

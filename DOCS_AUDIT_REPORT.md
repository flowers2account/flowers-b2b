# DOCS_AUDIT_REPORT.md — Аудит документации vs реальность

> **Дата аудита:** 2026-06-26  
> **Метод:** живой код `src/` + живая БД Supabase (`jwastcmasactymmzojhi`, через MCP) + `git log --since=2026-05-01`.  
> **Принцип:** источник правды — код и БД. `.md` считались устаревшими.  
> **Объём:** только READ-аудит + переписывание документации. Код, данные, миграции **не трогались**.

---

## 1. Сводка: что изменилось с момента, когда доки были актуальны (~2 мая 2026)

По git history (май–июнь 2026) и состоянию БД:

- **Перестройка склада (rebuild ~25.05).** Таблицы `batches` и `stock` **удалены** (сохранены копии `_backup_batches_pre_rebuild`, `_backup_stock_pre_rebuild`). Остатки теперь — плоское поле `products.qty`. FIFO/партионный учёт убраны.
- **Аксессуары / расходка** (`category='accessories'`) — целый каталог с деревом групп/листьев/фасетов (`src/lib/category-tree.ts`), фильтры по объёму, поставщику, материалу, цвету горшка.
- **Модуль предзаказов OZ** — `campaigns`, `campaign_items`, `campaign_orders`, `campaign_order_items`, `campaign_staging`, `campaign_access`; закрытые комнаты по коду; pricing-слой (EUR→KZT).
- **AI-перевод названий** — `translation_memory` (+ триггеры авто-парсинга структуры, view `translation_memory_enriched`/`_context`), Gemini Flash Lite, `display_name` через триггер `generate_product_display_name`.
- **AI-виджет-консультант** на сайте (`/api/chat`, `AiWidget.tsx`, `conversations`/`messages`), анонимные обращения в amoCRM (воронка «Обращения с сайта»).
- **Оплата ePay/Halyk** — `payments`, `payment_operations`, экран `/admin/payments`, постлинк, реестр банка.
- **Счета на оплату** — таблица `invoices` (нумерация с 9000001).
- **amoCRM интеграция** — лиды/контакты/этапы для `orders` и `campaign_orders`.
- **Umnico WhatsApp-уведомления** — цепочка по заказам менеджеру + кладовщику.
- **RLS включён** на большинстве таблиц (роллаут ~11.06) — раньше был выключен.
- **Деплой переехал на VPS** (GitHub Actions → hoster.kz). Vercel = только preview; авто-деплой с `main` **отключён** в `vercel.json`.
- Новые таблицы: `inventory_sessions`/`inventory_counts` (инвентаризация), `writeoffs` (списания), `favorites`, `app_settings`, `stock_import_rows`/`stock_aliases`/`imports` (staging импорта), `registration_requests`, `access_requests`, `bot_enabled_leads`, `search_synonyms`/`stop_words`.

---

## 2. Таблица расхождений (док → факт → действие)

| Документ | Что написано в доке | Как на самом деле (код/БД на 26.06) | Действие |
|---|---|---|---|
| **CONTEXT_FOR_NEW_SESSION.md** | Таблицы `batches`, `stock`; cron каждые 5 мин; service-role не работает на Vercel; FK `clients_id_fkey` убран; авторизация без auth-аккаунтов | `batches`/`stock` удалены, остаток = `products.qty`; cron `0 0 * * *` (раз в сутки); service-role используется в десятках роутов; авторизация = Supabase Auth (email `{digits}@flowers.local` + PIN), у клиента есть auth-аккаунт | **Переписан полностью** |
| **PROJECT_STATUS.md** | Статус на «14 июня», known issues про DetailPanel checkout, `name_display`, FIFO-баг | Перечисленные баги давно закрыты; поля `name_display` нет (есть `display_name`); FIFO удалён | **Переписан полностью** |
| **README.md** | «SUPABASE_SERVICE_ROLE_KEY не работает в serverless»; «push в main → автодеплой на Vercel»; «все мутации через RLS, не service role» | Service-role работает и используется повсеместно; авто-деплой с main в Vercel **отключён**, прод на VPS; большинство мутаций — через service-role серверные роуты | **Переписан** (раздел проекта; убран дублирующий хвост шаблона) |
| **docs/STOCK_MANAGEMENT.md** | 3-уровневая схема products→stock→batches; FIFO с багом `WHERE price=item.price`; `stock.qty_reserved` | Плоская схема: остаток в `products.qty`; `confirm_order_fifo` делает простое `qty := GREATEST(0, qty-ordered)`; колонки `qty_reserved` в products нет (резерв считается из `reservations` во view `stock_available`) | **Переписан полностью** |
| **docs/STOCK_QUICK_REF.md** | `stock`/`batches`/FIFO-баг/`qty_reserved` | то же, что выше | **Переписан полностью** |
| **QTY_RESERVED_TRIGGER_UPDATE.md** | Инструкция «обновить триггер `confirm_order_fifo` для `stock.qty_reserved`» | Таблицы `stock` нет; такой триггер не нужен и невозможен | **Помечен УСТАРЕЛО + ссылка на актуал** |
| **CRON_CLEANUP_SETUP.md** | Cron каждые 5 мин; правит `stock.qty_reserved`; индексы на `stock` | Cron `0 0 * * *` (Hobby = раз в сутки); удаляет только просроченные `reservations`; таблицы `stock` нет; есть второй внешний крон `widget-amo-sync` | **Переписан** |
| **RLS_POLICIES_SETUP.md** | 3 примера политик `client_id = auth.uid()` на orders/order_items | Боевые политики на orders/order_items — `is_admin_or_manager()`; клиентские заказы читаются через service-role роуты, не через RLS; RLS включён на ~24 таблицах | **Переписан** (зеркалит фактические политики) |
| **docs/IMPORT_SYSTEM.md** | Старый банк + «текущий импорт пишет напрямую в products» | Импорт двухфазный: `/api/import-xls` → staging `stock_import_rows` (+ матч по `stock_aliases`/`products.name`), затем `/api/import-xls/apply` обновляет `products`; категория по имени файла | **Переписан** под staging-флоу |
| **docs/NAMING_SYSTEM_STATE.md** | Плоская схема, NO FIFO, pack_size=5, display_name-триггер | Подтверждено фактом (всё верно) | **Сверен, дата-штамп обновлён** |
| **docs/AI_TRANSLATOR.md** | «127 переводов»; species/colors справочники | Логика верна; в БД `translation_memory` = 453 строки; есть `translation_memory_enriched`/`_context` views и триггеры авто-парса | **Обновлены факты/счётчики** |
| **CLAUDE.md** | «RLS отключён на clients/orders/order_items/reservations/products/varieties/inventory_ledger; включён только на profiles» | RLS включён практически везде (см. §4). Также: `oz_target_departure_date=2026-06-18`, `preorder_eur_kzt_rate=562` (в доке 29 / 525) | **Точечные правки** (RLS-раздел, app_settings, заметка про confirm_order_fifo) |
| **AGENTS.md** | Только баннер «это не тот Next.js» | — | **Дополнен** блоком контекста для агентов |

---

## 3. Проверка конкретных утверждений из ТЗ

| Утверждение | Вердикт | Факт |
|---|---|---|
| `batches`/`stock` удалены; источник остатков — `products.qty` | ✅ Верно | Живых таблиц нет, есть только `_backup_*_pre_rebuild`. `products.qty INT NOT NULL DEFAULT 0`. |
| Есть VIEW `products_available` | ❌ Неверно | Такого view нет. Есть `stock_available` (product_id, qty, qty_reserved, available_qty, is_active; **без price**). qty_reserved/available считаются на лету из `reservations WHERE expires_at>now()`. |
| Старый `stock_available` ещё существует | ✅ Да | Это и есть текущий боевой view. |
| `products.arrival_date (DATE)` существует и заполнена | ✅ Существует (nullable) | Колонка есть; задаётся при первом импорте, ручные правки не перезаписываются. |
| Баг `WHERE price=item.price` в `confirm_order_fifo` | ❌ Не существует (больше) | Тело функции: цикл по `order_items`, `UPDATE products SET qty=GREATEST(0, qty-item.qty)`, затем `DELETE reservations`. Никакого фильтра по цене и никакого FIFO. Баг жил в старой batches-версии — удалён вместе с партиями. |
| `campaign_orders_client_id_fkey` дропнут | ❌ Неверно | FK существует: `FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL`. |
| `translation_memory` + reference-таблицы + view `translation_memory_enriched` | ✅ Всё есть | + `translation_memory_context` view, справочники `species`/`characteristic_colors`/`characteristic_countries`/`characteristic_lengths`/`flower_types`. |
| Поле `products.name_display` | ❌ Нет | Поле называется `display_name` (text, nullable). `name_display` не существует. |
| enum `order_status`: cart→pending→reserved→confirmed→in_transit→arrived→assembling→assembled→delivered→cancelled | ⚠️ Почти | Реальный набор: `cart, pending, reserved, confirmed, in_transit, arrived, negotiation, assembling, assembled, cancelled, delivered`. **Есть незадокументированное значение `negotiation`.** |

---

## 4. Фактическое состояние RLS (на 26.06.2026)

**RLS ВКЛЮЧЁН** (`relrowsecurity=true`) на: `products, orders, order_items, reservations, clients, profiles, inventory_ledger, order_history, translation_memory, campaigns, campaign_items, campaign_orders, campaign_order_items, campaign_access, conversations, messages, invoices, payments, payment_operations, registration_requests, access_requests, bot_enabled_leads`.

**RLS ВЫКЛЮЧЕН** на: `app_settings`, `campaign_staging`, `favorites`, и все `*_backup_*`/`dedup_*` таблицы.

Ключевые политики:
- `products`: anon/public читает `is_active=true` (`products: public read active`); admin/manager — всё (`is_admin_or_manager()`).
- `orders`, `order_items`, `clients`, `inventory_ledger`: только `is_admin_or_manager()` (клиентские данные клиент читает через service-role роуты, не через RLS).
- `profiles`: read/update own (`id = auth.uid()`) + admin.
- `reservations`: own (`client_id = auth.uid()`) + admin/manager. ⚠️ `reservations.client_id` FK → `auth.users(id)` (а `orders.client_id` FK → `clients(id)` — разная семантика поля «client_id» в двух таблицах).
- `translation_memory`: anon читает approved & non-flagged; admin/manager — всё.

---

## 5. Найденные баги / риски (НЕ исправлялись — только зафиксированы)

1. **`confirm_order_fifo` — имя вводит в заблуждение.** Никакого FIFO/партий: простое `qty -= ordered`. Не баг, но tech-debt именования; документировать как «списание остатка».
2. **Мёртвые функции в БД:** `sync_stock_from_1c`, `sync_stock_from_batches`, `sync_stock_reserves` ссылаются на удалённые `stock`/`batches`. Не вызываются. Кандидаты на DROP.
3. **Открытые write-роуты без session-гарда.** Многие мутирующие роуты используют `createAdminClient()` (service-role, в обход RLS) и **не проверяют сессию/роль**: напр. `/api/checkout`, `/api/manager-order`, `/api/orders/[id]`, `/api/orders/[id]/assemble`, `/api/campaigns` (root, GET/POST), `/api/campaigns/[id]` (PATCH/DELETE), `/api/payments/postlink`. Защита — только «серверность» и неочевидность путей. Аудит авторизации желателен перед публичным запуском.
4. **SECURITY DEFINER RPC открыты для anon.** Преордерные/админские RPC (`get_admin_preorders`, `admin_*`, `get_preorder_room` и др.) доступны anon-роли; защита — только клиентский гард `/admin`. Известный tech-debt (см. CLAUDE.md).
5. **Просроченная дата вылета OZ.** `app_settings.oz_target_departure_date = 2026-06-18` — в прошлом (сегодня 26.06). Ночной `oz_price_refresh`/каталог берут эту дату → риск рассинхрона цен/наличия. `oz_price_deactivate_enabled=false` (деактивация по цене выключена — снижает урон).
6. **Рассинхрон настроек преордера:** в БД `preorder_eur_kzt_rate=562`, `preorder_markup_percent=35`, `eur_rate_extra_percent=2`; в CLAUDE.md упомянут курс 525. Источник правды — `app_settings`.
7. **Мусорные backup-таблицы в `public`:** 12× `_backup_*_pre_rebuild`, `products_backup_20260518/20260525`, `*_backup_dedup_20260525`, `dedup_mapping_20260525`. Висят в проде, RLS off. Кандидаты на перенос/удаление.
8. **`favorites` без RLS** (включён доступ шире нужного) — известный бэклог.
9. **PIN хранится в открытом виде** в `clients.pin` (дублирует пароль Supabase Auth). Нужно для ресинка PIN; но это чувствительные данные в обычной таблице.
10. **enum `negotiation`** в `order_status` нигде не задокументирован и не отражён в маппинге amoCRM статусов.

---

## 6. Что переписано (Фаза 5)

- `DOCS_AUDIT_REPORT.md` — этот файл (новый).
- `CONTEXT_FOR_NEW_SESSION.md` — полностью.
- `PROJECT_STATUS.md` — полностью.
- `README.md` — раздел проекта.
- `docs/STOCK_MANAGEMENT.md`, `docs/STOCK_QUICK_REF.md` — полностью.
- `docs/IMPORT_SYSTEM.md` — полностью (staging-флоу).
- `docs/AI_TRANSLATOR.md` — факты/счётчики.
- `docs/NAMING_SYSTEM_STATE.md` — сверка + дата.
- `RLS_POLICIES_SETUP.md`, `CRON_CLEANUP_SETUP.md`, `QTY_RESERVED_TRIGGER_UPDATE.md` — переписаны/помечены.
- `CLAUDE.md` — точечные правки (RLS, app_settings, confirm_order_fifo).
- `AGENTS.md` — дополнен.
</content>
</invoke>

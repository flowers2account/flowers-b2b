# CONTEXT_FOR_NEW_SESSION.md — Flowers B2B

> Быстрый старт-контекст для новой сессии (человек или AI).  
> **Обновлено:** 2026-06-26 (сверено с живым кодом `src/` и БД Supabase `jwastcmasactymmzojhi`).  
> Полная техдока — `CLAUDE.md`. Расхождения старых доков с реальностью — `DOCS_AUDIT_REPORT.md`.

## Проект

B2B-платформа оптовой торговли цветами и расходными материалами. Бренд **«Цветы Уральска»** (Казахстан, Уральск). Клиенты-оптовики смотрят каталог, кладут в корзину, оформляют заказ; оплата онлайн (ePay/Halyk) или по счёту; менеджер/кладовщик получают уведомления (Telegram + WhatsApp/Umnico), собирают и выдают заказ. Реквизиты — единый источник `src/config/company.ts`.

- **Стек:** Next.js 16 (App Router, `output: 'standalone'`), React 19, TypeScript, Tailwind, Zustand.
- **БД:** Supabase (PostgreSQL + RLS), проект `jwastcmasactymmzojhi` (один на prod и preview).
- **Прод:** собственный VPS hoster.kz (`109.235.118.214`, Астана) — Node 22 + pm2 + nginx. Деплой `push→main` через GitHub Actions (`.github/workflows/deploy-vps.yml`). См. `docs/INFRA.md`.
- **Preview:** Vercel (`flowers-b2b-phi`). ⚠️ Авто-деплой с `main` в Vercel **отключён** (`vercel.json` → `git.deploymentEnabled.main: false`).
- **Домен:** `uralskflowers.kz` — ⏳ ждёт DNS.

## Архитектура остатков (ВАЖНО — читать первым)

**Плоская схема.** Таблиц `batches` и `stock` **больше нет** (удалены при rebuild ~25.05.2026, остались только `_backup_*_pre_rebuild`). Никакого FIFO/партионного учёта.

- Остаток товара — поле **`products.qty` (int)**. Цена — `products.price`. Всё в одной строке `products`.
- Каждая «партия с уникальной ценой» = отдельная карточка `products` (своя цена/остаток).
- **Резерв** живёт в таблице `reservations` (TTL 30 мин). Доступное количество считает **view `stock_available`** (`product_id, qty, qty_reserved, available_qty, is_active` — **без price**): `available_qty = GREATEST(0, qty − SUM(активные reservations))`. Колонки `qty_reserved` в `products` нет — она вычисляется во view.
- Подтверждение заказа: триггер `trg_order_confirm` → функция `confirm_order_fifo(order_id)` (имя историческое — **FIFO там нет**): для каждой позиции `qty := GREATEST(0, qty − ordered)`, пишет в `inventory_ledger (action='sale')`, удаляет резервы заказа.
- Чистка просроченных резервов: cron `/api/cron/cleanup` (раз в сутки, см. ниже).

## Что в системе есть (по факту)

- **Каталог 3 категории** (`products.category` enum): `cut` (срезка), `pot` (горшечные), `accessories` (расходка). Витрина показывает только `is_active=true AND source IN ('uralsk_site','uralsk_1c')`.
- **Аксессуары/расходка** — дерево групп→листьев (`src/lib/category-tree.ts`), фасеты (объём, поставщик, материал, цвет горшка), фильтры (`/api/facets`).
- **Выбор цвета как ярлык** (не SKU): у товара с `products.colors[]` клиент выбирает цвет, снимок в `order_items.color`. Палитра — `src/lib/colors.ts`.
- **Поиск** — серверный `/api/search` → RPC `search_products` (+ синонимы, trigram).
- **Предзаказы OZ** — закрытые комнаты-кампании (`campaigns`/`campaign_items`/`campaign_orders`/`campaign_staging`/`campaign_access`), pricing EUR→KZT, вход по коду. Подробно — `CLAUDE.md` + memory `project_preorders`.
- **Оплата** — ePay/Halyk (`/api/payments/init` → `/api/payments/postlink`), таблицы `payments`/`payment_operations`, экран `/admin/payments`. См. `docs/PAYMENTS.md`.
- **Счета на оплату** — таблица `invoices` (номер с 9000001), `/admin`.
- **amoCRM** — `orders`/`campaign_orders` → лиды/контакты/этапы (`src/lib/amo.ts`).
- **AI-виджет-консультант** на сайте (`/api/chat`, `AiWidget.tsx`) — тот же «мозг», что и Umnico-бот расходки (`accessories-bot.ts`); история в `conversations`/`messages`; анонимные обращения → воронка amoCRM «Обращения с сайта».
- **AI-перевод названий** — `translation_memory` + Gemini Flash Lite; `display_name` через триггер.
- **Уведомления** — Telegram + Umnico/WhatsApp (менеджеру `UMNICO_MANAGER_PHONE` и кладовщику `UMNICO_WAREHOUSE_PHONE`).
- **Импорт** — XLS из 1С (staging) и каталоги поставщиков (OZ/Waterdrinker), 1С-интеграция `/api/integrations/1c/stock`.
- **Инвентаризация** (`inventory_sessions`/`inventory_counts`), **списания** (`writeoffs`).

## Авторизация

- Телефон + 6-значный PIN через Supabase Auth.
- Email для auth = `normalizePhone(phone).replace('+','') + '@flowers.local'` (напр. `+77476108458` → `77476108458@flowers.local`). `src/lib/phone.ts` → `normalizePhone()` приводит к `+7XXXXXXXXXX` (или `+<код>` для международных).
- PIN = пароль auth-аккаунта; дублируется в `clients.pin` (для ресинка). Вход: `supabase.auth.signInWithPassword({email, password: pin})`.
- Клиент создаётся в `auth.users` + `profiles` (роль) + `clients` (профиль). Гость может оформить заказ без регистрации (`orders.guest_phone`/`guest_name`).
- Защита `/admin`,`/cabinet` — на клиенте через `useAuthStore` (`src/lib/auth-store.ts`). Серверные роуты в основном на service-role (см. ниже).

### Тестовые аккаунты
| Роль | Телефон | PIN |
|------|---------|-----|
| admin | +77476108458 | 123456 |
| client | +77001234567 | 123456 |

## Доступ к БД из кода (важная особенность)

- `src/lib/supabase/admin.ts` → `createAdminClient()` — **service-role**, обходит RLS. Используется в десятках API-роутов и **работает на проде** (старое ограничение «не работает в serverless» — миф).
- `src/lib/supabase/server.ts` → `createClient()` — anon + RLS (сессия из cookie). Используется в read-роутах витрины (`/api/products`, `/api/search`, `/api/facets`, `/api/cashier/products`).
- `src/lib/supabase/client.ts` → singleton anon-клиент (браузер).
- Admin-чтение/запись часто идёт через **SECURITY DEFINER RPC** под anon-ключом (паттерн `get_preorder_room`, `admin_*`) — обходит RLS без service-role. ⚠️ Эти RPC открыты для anon; защита — клиентский гард `/admin` (tech-debt).

## RLS (на 26.06.2026)

Включён почти везде (`products, orders, order_items, reservations, clients, profiles, inventory_ledger, order_history, translation_memory, campaign_*, conversations, messages, invoices, payments, payment_operations` и др.). Выключен на `app_settings`, `campaign_staging`, `favorites`, backup-таблицах. Витрина: anon читает `products WHERE is_active`. Клиентские данные (заказы) читаются через service-role роуты, не через клиентский RLS. Детали — `RLS_POLICIES_SETUP.md`.

## Cron

`vercel.json` содержит **один** крон: `/api/cron/cleanup` — `0 0 * * *` (раз в сутки, лимит Vercel Hobby; 00:00 UTC = 05:00 Asia/Oral). Удаляет просроченные `reservations`. Защита — `Authorization: Bearer ${CRON_SECRET}`. Второй крон — `/api/cron/widget-amo-sync` (досыл сводок виджета в amo, «застрявшие» лиды) — запускается **внешним планировщиком** (VPS), не из `vercel.json`. См. `CRON_CLEANUP_SETUP.md`.

## Ключевые таблицы

| Таблица | Назначение |
|---|---|
| `products` | Каталог + остаток (`qty`) + цена (`price`); плоская схема |
| `varieties`, `species` | Сорта / виды (для нейминга и перевода) |
| `stock_available` (VIEW) | qty − активные резервы (без price) |
| `orders`, `order_items` | Заказы витрины + позиции (`order_items.color`) |
| `reservations` | Резервы корзины (30 мин) |
| `clients`, `profiles` | Клиенты / роли (`admin`/`manager`/`client`) |
| `campaigns`, `campaign_items`, `campaign_orders`, `campaign_order_items`, `campaign_staging`, `campaign_access` | Предзаказы OZ |
| `translation_memory` (+ `_enriched`/`_context` views) | AI-перевод названий |
| `payments`, `payment_operations`, `invoices` | Оплата ePay + счета |
| `conversations`, `messages` | История AI-виджета |
| `inventory_ledger`, `writeoffs`, `inventory_sessions`/`inventory_counts` | Аудит остатков / списания / инвентаризация |
| `app_settings` | Ключ-значение настроек (курсы, дата вылета OZ, тогглы) |

## Переменные окружения (основные)

```
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY   # браузер + бэк
SUPABASE_SERVICE_ROLE_KEY                                 # сервер (работает на проде!)
CRON_SECRET                                               # защита /api/cron/*
GOOGLE_GEMINI_API_KEY, NEXT_PUBLIC_GEMINI_MODEL           # AI-перевод/бот/виджет
UMNICO_API_TOKEN, UMNICO_BOT_USER_ID,
UMNICO_MANAGER_PHONE, UMNICO_WAREHOUSE_PHONE              # WhatsApp/Umnico
AMO_ACCESS_TOKEN, AMO_INQUIRY_PIPELINE_ID, AMO_INQUIRY_STATUS_*  # amoCRM
OZ_IMPORT_SECRET                                          # импорт OZ-предзаказов
```
Полный список — `CLAUDE.md` → «Environment Variables» и `docs/INFRA.md`.

## База знаний

`CLAUDE.md` (главная техдока) · `DOCS_AUDIT_REPORT.md` (расхождения доков) · `PROJECT_STATUS.md` · `docs/INFRA.md` · `docs/PAYMENTS.md` · `docs/STOCK_MANAGEMENT.md` · `docs/IMPORT_SYSTEM.md` · `docs/NAMING_SYSTEM_STATE.md` · `docs/AI_TRANSLATOR.md` · `docs/UMNICO_BOT.md` · `docs/WIDGET_TECH_CONTEXT.md` · `docs/OZ_CATALOG_SYNC.md` · `docs/SECURITY-RLS-PLAN.md`.

## Локальная разработка

```bash
npm install
npm run dev        # http://localhost:3000
npm run build
```
`.env.local` с тремя ключами Supabase (URL, anon, service-role) минимально достаточен для каталога и большинства роутов.
</content>

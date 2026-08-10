# Инструкции для Claude — Flowers B2B

> **Версия от 07.07.2026.** Заменяет прежнюю (Vercel-эпохи) версию, которая устарела и содержала неверные факты (batches/stock-таблицы, авто-деплой Vercel, миф про `createAdminClient`). Все сведения ниже сверены с живой БД (Supabase project `jwastcmasactymmzojhi`) и аудитом кодовой базы 07.07.2026.

## Контекст проекта

B2B-платформа оптового склада цветов и флористической расходки **ТОО «Цветы Уральска»** (Уральск, Казахстан). Клиенты — небольшие цветочные магазины, заказывают оптом 2–3 раза в неделю.

- **Прод:** https://uralskflowers.kz (на собственном **VPS** `109.235.118.214`, не Vercel)
- **GitHub:** github.com/flowers2account/flowers-b2b
- **Supabase project_id:** `jwastcmasactymmzojhi`
- **Стек:** Next.js 16, Supabase (PostgreSQL + RLS + Auth + Storage), Tailwind, Zustand, **VPS-деплой через GitHub Actions**

---

## ГЛАВНОЕ ПРАВИЛО: сверяйся с живой БД

Документация регулярно отстаёт от реальности. **Перед любой рекомендацией или изменением, зависящим от схемы, — сначала запрос к живой БД через Supabase MCP.** Не полагайся на этот файл как на истину в последней инстанции по схеме — проверяй.

---

## Инструменты и рабочий процесс

- **Claude Code** — основной инструмент разработки, запускается локально в **VS Code** на машине владельца (Windows), не в Codespace.
- **Supabase MCP** (`execute_sql`, `apply_migration`) — для запросов и проверки данных. `apply_migration` необратима — только после явного подтверждения владельца.
- **Рабочий цикл:** правки в коде → `git push origin main` → GitHub Action «Deploy to VPS» собирает и разворачивает автоматически (scp → `/srv/flowers-b2b` → `pm2 reload`, zero-downtime). Пуш feature-веток деплой НЕ запускает.
- **Откат:** `git revert <commit>` + push в main → CI передеплоит на рабочую сборку.
- **CI-секреты:** в GitHub Action доступны только `NEXT_PUBLIC_*`. Нельзя инстанцировать service-role/admin-клиент на уровне модуля — только внутри обработчиков (иначе сборка падает). См. `src/lib/api-auth.ts`, `src/lib/supabase/admin.ts`.

### Среда Windows / PowerShell
- Нет `&&` — команды по одной (либо использовать Bash-tool для POSIX-скриптов).
- Нет `grep` — `Select-String` (или Grep-tool).
- Нет `curl` — `Invoke-RestMethod`.
- Файлы с `[id]` в пути не читаются через PowerShell (квадратные скобки фильтруются).
- **Никогда** не использовать `Set-Content` для исходников с кириллицей/JSX — портит кодировку. Править через Edit/Write-tool или прямо в VS Code.

---

## Критические правила

### 1. Service Role
Миф «`createAdminClient()` не работает на Vercel» — **неверен**. Прод на VPS, service-role используется штатно во многих роутах. Но для **действий пользователя** (заказы, изменения от имени клиента/оператора) используй сессионный клиент + RLS, а не анонимный service-role. Операторская консоль ходит через Bearer-токен сессии (`src/lib/api-auth.ts` → `sessionClient` / `getAuthedWithRole`) с проверкой `is_admin_or_manager()`.

### 2. Часовой пояс
Всегда Asia/Oral (UTC+5): `date.toLocaleString('ru-RU', { timeZone: 'Asia/Oral' })`.

### 3. Cron
Раз в день (`"0 0 * * *"`). Чистит истёкшие резервы. Не учащать.

### 4. Категория товара (enum)
`products.category` — enum **`product_category`**: `cut` (срез), `pot` (горшечные), `accessories` (расходка). При импорте XLS категория определяется по имени файла (см. `/api/import-xls`). Активная торговля сейчас в основном по расходке.

### 5. Деньги — только на сервере
Итог заказа считается **на сервере** единым хелпером `src/lib/order-total.ts` → `computeOrderTotal({ items, fulfillmentType, deliveryCity, deliveryCost })`. Скидка 1 % — при самовывозе ИЛИ доставке по Уральску. Не дублировать расчёт в других местах.

### 6. Прайс виден без регистрации (кроме среза)
Оптовые цены на **расходку и горшечные** видны **всем без регистрации**; регистрация открывает только корзину/калькулятор и остаток на складе. Цены на **срез (`cut`)** — под авторизацией (решение владельца 10.08.2026: закупочный уровень по срезу публично не показывать).

Единое условие показа цены — `isAuthed || product.category !== 'cut'`; точки: `ProductGrid.tsx` (×3), `DetailPanel.tsx`. Менять только все сразу.

Фраза **«оптовые цены после регистрации» не должна появляться нигде** в продукте.

### 6.1. Горшечные: неприменимые характеристики
`stems_per_pack` («стеблей в упаковке») — характеристика **среза**; для `category='pot'` всегда `NULL`, кратность `pack_size=1` (горшки продаются поштучно). Гард в `scripts/import-waterdrinker.mjs` при сборке товара + страховка в UI (`product/[id]`, `DetailPanel`).

### 7. Пустой деплой
`git commit --allow-empty -m "trigger deploy"` затем `git push origin main` (в среде без `&&` — двумя командами).

---

## Структура БД (плоская схема — сверено с живой БД 07.07.2026)

**Остатки хранятся прямо в `products` — отдельных таблиц `batches`/`stock` НЕТ.**

```
products   — товар И остаток в одной строке:
             id (INTEGER, не UUID!), variety_id, category(product_category: cut/pot/accessories),
             name, display_name, qty, price, pack_size, subcategory,
             is_active, image_url, source, code_1c, length_cm, pot_diameter, colors[], …
stock_available — VIEW: доступный остаток (qty за вычетом активных резервов); price НЕ содержит
reservations    — резервы на 30 мин: id, product_id, order_id, client_id, qty, expires_at, created_at
orders     — заказы: total, status, payment_status(paid/unpaid),
             payment_method(card/cash/epay/halyk_qr/invoice), paid_at,
             fulfillment_type(delivery/pickup), delivery_city/address/date,
             recipient_*, driver_*, delivery_cost, amo_lead_id/amo_synced_at, …
order_items    — позиции: order_id, product_id, qty, price, color
order_history  — лог смены статусов: status_from, status_to, changed_by, note, created_at
clients    — клиенты: id(uuid), phone(+77XXXXXXXXX), name, company_name, bin, city, address,
             credit_limit, status(client_status: active/inactive/blocked), pin, auth_user_id,
             amo_contact_id, created_at
profiles   — профили: id(=auth.users.id), role(admin/manager/client), full_name, phone
app_settings   — настройки (city_delivery_fee=2000, preorder_*, oz_*, eur_rate_*)
```

- `products.id` — **INTEGER**. Внешние ключи на products(id) должны быть INTEGER.
- Поле называется **`display_name`** (не `name_display`).
- `clients.pin` — **чувствительное поле**: никогда не выбирать в API-ответы, уходящие на клиент.

### Статусы заказов (enum order_status)
`cart, pending, reserved, confirmed, in_transit, arrived, negotiation, assembling, assembled, cancelled, delivered`

Основной жизненный цикл: `pending → reserved → confirmed → assembling → assembled → delivered` (+ `cart`, `negotiation`, `in_transit`/`arrived` для предзаказов, `cancelled`).

### Триггеры на `orders` (сверять актуальность в live БД)
- `trg_order_status_history` — пишет `order_history` при смене статуса (сам проставляет `changed_by` из `auth.uid()` — поэтому мутации оператора идут сессионным клиентом, не service-role).
- `trg_order_confirm` — при переходе в `confirmed` вызывает `confirm_order_fifo(order_id)` (списание остатка; логику FIFO проверять в live БД перед изменениями).
- `trg_order_cancel` — снимает резервы при `cancelled`.
- `trg_order_delete` — снимает резервы при удалении заказа.
- `set_updated_at_orders` — поддерживает `updated_at`.

### Auth
- `auth.users.email` = `{цифры_телефона}@flowers.local`; `clients.phone`/`profiles.phone` = `+77XXXXXXXXX`.
- Вход — `signInWithPassword` (телефон+PIN), без гейта по `clients`/`registration_requests`.
- Прямая вставка в `auth.users` через SQL требует всех токен-колонок (`confirmation_token`, `recovery_token`, `email_change_token_new`, `email_change` и др.) `= ''` (не NULL), иначе GoTrue 500 на логине. Лучше заводить пользователей через Supabase Auth (дашборд/admin API).

---

## Бизнес-логика

### Физлицо / юрлицо — выбор НА ЗАКАЗ, не атрибут клиента
Определяется способом оплаты на checkout:
- `card` / `epay` / `cash` → **физлицо**: оплата мгновенная. **Есть заказ = уже оплачен.** Состояния «не оплачен» для этого пути не существует.
- `invoice` / `halyk_qr` → **юрлицо**: счёт → ждём оплату → ручное/QR-подтверждение. Только здесь `unpaid` осмыслен.

### Тип выдачи
`fulfillment_type` + `delivery_city` vs домашний город «Уральск»:
- Самовывоз (pickup), Доставка (delivery, Уральск), Межгород (delivery, другой город).
- Доставка по городу: **2000 ₸** из `app_settings.city_delivery_fee`. Межгород — «по согласованию».

### Путь клиента
Каталог без авторизации (цены видны) → корзина шагом `pack_size` (после регистрации) → checkout (выбор оплаты/выдачи) → заказ + резерв на 30 мин. Лид в amoCRM и уведомление WhatsApp создаёт **API-слой checkout**, не триггеры БД — прямые SQL-вставки заказов их обходят.

### Выбор цвета (order_items.color)
Цвет — **подпись к позиции**, не складская единица: цена/остаток общие на товар. Включается для любого товара с заполненным `products.colors[]`. Снимок цвета пишется в `order_items.color`. Единый источник свотчей/нормализации — `src/lib/colors.ts` (`normalizeColor`, `colorSwatch`, `getColorMode`).

### Операторская консоль `/admin/console`
Пульт склад-оператора (роли `manager` и `admin`): табло заказов, «взять в работу», правка состава (до подтверждения), подтверждение оплаты (юр-счёт), печать, отмена. **Вкладка «Клиенты»** — список зарегистрированных клиентов из `clients` (имя, телефон, компания, БИН, город, лимит, статус, дата регистрации Asia/Oral + агрегат кол-ва и суммы заказов по `client_id`), поиск по имени/телефону/компании; данные через `/api/admin/console/clients` (сессионный RLS-эндпоинт, `pin` не отдаётся).
Режим киоска: `SiteChrome` не монтирует шапку/футер/ИИ-виджет на этом роуте. Печать — `/print/order/[id]` (автономный роут, новая вкладка). Маршрутизация по ролям: `src/lib/home-path.ts` (admin→/admin, manager→/admin/console, client→/cabinet).

---

## Интеграции

- **amoCRM** — автосоздание сделок по заказам (через checkout API), маппинг статусов, воронка обращений виджета.
- **WhatsApp (Umnico)** — PIN при регистрации + уведомления по заказам (менеджер + кладовщик).
- **Halyk QR (OnlineDuken)** — оплата по QR для юрлиц.
- **Счёт на оплату (PDF)** — `src/lib/invoice/generate-invoice-pdf.ts` + `create-invoice.ts` → Supabase Storage (таблица `invoices`, нумерация с 9000001, QR, срок 3 дня). pdfkit подключён как external-пакет для работы в standalone на VPS.
- **Gemini API** — AI-перевод названий из инвойсов поставщиков; ИИ-виджет-консультант по расходке.
- **1С** — импорт остатков через **XLS** (`/api/import-xls`, ключ поиска — `products.name`; `code_1c` — колонка кода). ⚠️ Функция `sync_stock_from_1c()` в БД существует, но это **мёртвый код** (ссылается на удалённые `batches`/`stock`) — импортом не вызывается.

---

## Известные проблемы и техдолг

| Приоритет | Проблема |
|---|---|
| 🔴 | `create-product` пишет `source='1c_manual'` → товар невидим на витрине (витрина фильтрует `source IN ('uralsk_site','uralsk_1c')`) |
| 🔴 | Уязвимости: часть write-роутов/SECURITY DEFINER RPC защищены только клиентским гардом /admin; нужен auth-аудит |
| 🟡 | Кампании (API предзаказов) используют `createAdminClient()` как временный обход авторизации (осознанный техдолг) |
| 🟡 | `ProductEditModal` не содержит `SUBCAT_ACC` (показывает подкатегории среза для расходки) |
| 🟡 | PIN не синхронится с `auth.users` при смене админом |
| 🟡 | XLS-импорт: улучшить автозаполнение color/origin/farm/image_url; стоп-слова |

---

## Приоритетные задачи

1. **🔴 Предзаказы (кампании)** — europe/china: DB-таблицы (есть), `/admin` страница, клиентская страница с таймером, сводный заказ поставщику, Excel-экспорт. Убрать `createAdminClient`-обход, вернуть проверки авторизации.
2. **🔴 Безопасность** — закрыть write-роуты проверками роли, SECURITY DEFINER RPC.
3. **🟡 amoCRM** — решение по владельцу статуса (Сайт vs Amo) и границе продажных/складских стадий; затем боевая синхронизация.
4. **🟡 OZ Holland XLS-импорт** — автозаполнение полей из xlsx.
5. **🟢 Мобильная вёрстка, планшетный режим консоли.**

---

## База знаний (docs/)

Детальная документация по подсистемам. ⚠️ Отдельные файлы отстают от кода — сверять с live БД/кодом.

| Файл | Тема | Статус |
|------|------|--------|
| `INFRA.md` | VPS, деплой (deploy-vps.yml), nginx/pm2/certbot, env | актуально |
| `PAYMENTS.md` | Оплата epay/Halyk: поток, схема, юр.слой | актуально |
| `BUSINESS_LOGIC.md` | Жизненный цикл заказа, резервы, кампании | база |
| `ARCHITECTURE.md` | Стек, структура папок, API-роуты, Zustand-сторы | база |
| `DATABASE_SCHEMA.md` | Таблицы, views, триггеры, функции, FK-карта | сверять с live |
| `STOCK_MANAGEMENT.md` / `STOCK_QUICK_REF.md` | Архитектура остатков | база |
| `CATALOG_IMPORT.md` | Импорт каталога поставщиков (OZ, Waterdrinker) | актуально |
| `OZ_CATALOG_SYNC.md` / `OZ_INTERNAL_API.md` / `OZ_PRICE_REFRESH.md` | Сбор каталога и цен OZ (VPS-парсеры, дата вылета) | актуально |
| `AI_TRANSLATOR.md` | AI-переводчик инвойсов, `translation_memory` | база |
| `UMNICO_BOT.md` | ИИ-бот поддержки в Umnico (расходка) | актуально |
| `WIDGET_TECH_CONTEXT.md` | Нативный AI-виджет на сайте + обращения в amoCRM | актуально |
| `ACCESSORIES_SEARCH.md` | Поиск расходки (нормализация, ILIKE-ступени, trigram) | актуально |
| `CLIENT_FAQ.md` | Памятка клиента (генерится из `src/lib/bot/site-faq.ts`) | актуально |
| `AUDIT-1C-MAPPING.md` | Маппинг 1С → каталог | план |
| `NAMING_SYSTEM_STATE.md` | Состояние нейминга, дубли товаров | база |
| `SECURITY-RLS-PLAN.md` / `SECURITY-ANON-FIX.md` | RLS-план и фикс anon-грантов | актуально |
| `DESIGN-CHANGES.md` / `UX_DESIGN_BRIEF.md` / `PHOTO_UPLOAD.md` / `photo-enrichment.md` | UI/UX/фото | сверять |
| `KNOWN_ISSUES.md` / `ROADMAP.md` | Баги и планы | сверять |
| `IMPORT_SYSTEM.md` | Импорт XLS из 1С | ⚠️ устарело (описывает batches/stock) |
| `BANK_AUDIT_2026-06-04.md` / `AMO_CHAT_RESEARCH.md` | Разовые аудиты/ресёрч | архив |

---

## Обновление документации
В конце сессии обнови `CLAUDE.md` и профильный `docs/*.md` — что сделано, known issues, задачи. Коммит + push. При правках, затрагивающих схему, сначала сверься с live БД.

---

## Полезные SQL (плоская схема)

```sql
-- Остатки товара
SELECT p.id, p.display_name, p.qty, p.price, sa.available_qty
FROM products p
LEFT JOIN stock_available sa ON sa.product_id = p.id
WHERE p.display_name ILIKE '%название%';

-- Активные резервы
SELECT r.*, p.display_name FROM reservations r
JOIN products p ON p.id = r.product_id
WHERE r.expires_at > now();

-- Последние заказы
SELECT id, status, payment_status, total, created_at
FROM orders ORDER BY created_at DESC LIMIT 10;

-- История статусов заказа
SELECT status_from, status_to, changed_by, created_at
FROM order_history WHERE order_id = <id> ORDER BY created_at;

-- Активная расходка (для отчётов «активных товаров»)
SELECT count(*) FROM products WHERE is_active=true AND category='accessories';

-- Очистить истёкшие резервы
DELETE FROM reservations WHERE expires_at < now();
```

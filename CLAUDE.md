# Flowers B2B — Оптовый склад цветов

## Описание проекта

B2B платформа для оптовой торговли цветами. Система управления товарами, заказами, резервированием остатков и подтверждением отгрузки.

## Стек технологий

- **Frontend**: Next.js 16, React, Tailwind CSS, Zustand (состояние)
- **Backend**: Next.js API Routes (serverless functions на Vercel)
- **База данных**: Supabase (PostgreSQL + RLS)
- **Хостинг**: Vercel
- **Аутентификация**: Supabase Auth (телефон + PIN, через @supabase/supabase-js — @supabase/ssr убран)

## Аутентификация

- Вход по телефону + PIN через `supabase.auth.signInWithPassword()`
- Email формируется как: `normalizePhone(phone).replace('+', '') + '@flowers.local'`
  - Пример: телефон `+77476108458` → email `77476108458@flowers.local`
- Состояние хранится в Zustand: `src/lib/auth-store.ts` (singleton, `_initialized` флаг)
- Singleton Supabase client: `src/lib/supabase/client.ts`
- Защита /admin и /cabinet — только на клиенте через `useAuthStore`
- Серверные auth проверки убраны из API маршрутов; `userId` передаётся в теле запроса

### Тестовые аккаунты
| Роль | Телефон | PIN |
|------|---------|-----|
| admin | +77476108458 | 284700 |
| client | +77001234567 | 123456 |

## Стандарт формата телефона

- Везде используется формат **+7XXXXXXXXXX** (11 цифр с +)
- `normalizePhone()` из `src/lib/phone.ts` — единая точка нормализации
- Email для Supabase Auth: `normalizePhone(phone).replace('+', '') + '@flowers.local'`

## Структура базы данных

### Плоская схема products (актуально с 25.05.2026)

Таблицы `batches` и `stock` **удалены**. Все данные хранятся напрямую в `products`:

| Поле | Тип | Описание |
|------|-----|---------|
| `id` | int | PK |
| `name` | text | Raw-название из 1С — **неизменяемый якорь** для импорта |
| `display_name` | text | Отображаемое название (ручное или из триггера) |
| `variety_id` | int | FK → varieties |
| `category` | text | `cut` / `pot` |
| `subcategory` | text | roses, chrysanthemums, lilies и т.д. |
| `variety_type` | text | single / spray / pompom / santini (для хризантем: single=Bl, spray=Sp, santini=Sa) |
| `length_cm` | int | Длина стебля (редактируется вручную, импорт не перезаписывает) |
| `pot_diameter` | float | Диаметр горшка |
| `country_iso` | text | ISO код страны (CN/EC/KE/NL/…) |
| `farm` | text | Ферма-производитель |
| `colors` | text[] | Массив ключей цветов |
| `image_url` | text | Основное фото (Supabase Storage: `product-images`) |
| `campaign_image_url` | text | Второе фото для ховер-эффекта и генератора карточек |
| `pack_size` | int | Кратность заказа (= `stems_per_pack` для OZ-товаров) |
| `stems_per_pack` | int | Стеблей в упаковке (из `quantity_stems` OZ) |
| `weight_gram` | int | Вес пачки в граммах (из OZ, ~270/1311 товаров) |
| `price` | numeric | Цена за штуку |
| `previous_price` | numeric | Предыдущая цена (заполняется импортом при снижении цены) |
| `qty` | int | Остаток |
| `arrival_date` | date | Дата поступления (задаётся при первом импорте, не перезаписывается) |
| `is_active` | bool | Активен ли товар |
| `is_new` | — | Вычисляется на лету: `arrival_date = today` |

### Прочие таблицы

- **varieties** — сорта товаров (Red Naomi, Freedom и т.д.)
- **stock_available** — view: `product_id, qty, qty_reserved, available_qty, is_active` (без price!)
- **orders** — заказы клиентов (статусы: pending → reserved → confirmed → cancelled)
- **order_items** — товары в заказе
- **reservations** — временные резервирования остатков (30 мин)
- **clients** — профили клиентов
- **profiles** — дополнительные данные пользователей (роль, компания)
- **inventory_ledger** — аудит всех изменений остатков
- **translation_memory** — кэш AI-переводов названий

⚠️ `sync_stock_from_1c` — PostgreSQL функция, **мёртвый код**. Ссылается на удалённые таблицы `batches`/`stock`. Не вызывается импортом.

## Импорт из XLS — актуальная логика (26.05.2026)

Реализован в `src/app/api/import-xls/route.ts`. Функция `sync_stock_from_1c` **не используется**.

### Ключ поиска: `name` (raw из 1С)

```
Ищем: products WHERE name = row.name
```

- `name` — verbatim строка из XLS, **никогда не меняется при ручном редактировании**
- Ручные правки `length_cm`, `display_name`, `country_iso`, `image_url` не ломают поиск

### Поведение при UPDATE (товар найден)

Обновляется: `qty`, `price`, `is_active = true`

Также: если новая цена **ниже** текущей → `previous_price = старая цена` (триггер тега "Акция")

НЕ перезаписывается (сохраняются ручные правки):
- `arrival_date` — задаётся только при первом INSERT
- `length_cm` — если уже заполнено вручную
- `country_iso` — обогащается только если было NULL
- `display_name` — если уже задано (вручную или из переводчика), не перезаписывается
- `colors` — обогащается из AI только если было NULL/пусто
- `tags` — авто-теги проставляются только если тегов ещё нет
- `image_url`, `campaign_image_url`

### display_name и TM переводчика (26.05.2026)

`display_name` собирается по приоритету:

1. **Ручной ввод** в ProductEditModal — приоритет абсолютный, никогда не перезаписывается
2. **Утверждённый перевод из TM переводчика** (`approved_by IS NOT NULL`, `is_flagged = false`) — берётся при импорте, если `cultivar_cyrillic` из AI-обогащения состоит из 2+ слов и совпадает с `normalized_translated` (ILIKE `%cultivar%`). Перед использованием очищается функцией `cleanTranslatorName()`
3. **Автогенерация триггером** `generate_product_display_name` — если `display_name IS NULL` после INSERT

`cleanTranslatorName()` стрипит из перевода: числа (`140`, `*140`), имена ферм (ALL-CAPS 3+ букв: `LINFLOWERS`), страны в скобках. Применяет INITCAP.  
Пример: `"хризантема ветковая балтика 140 LINFLOWERS"` → `"Хризантема Ветковая Балтика"`

Переводчик сохраняет переводы дословно (с длиной, фермой) — очистка происходит автоматически при импорте.

Если перевод оказался неверным:
- Исправить в TM переводчика (bulk-страница `/admin/translations/bulk`)
- Очистить `display_name` в ProductEditModal (оставить пустым)
- Повторить импорт

### Авто-теги при импорте (26.05.2026)

`tags` проставляются автоматически при импорте через `autoTagProduct()`, если у продукта ещё нет тегов:

| Тег | По подкатегории | По ключевым словам |
|-----|----------------|-------------------|
| `exotic` | orchids, anthuriums, proteas | стрелиц, геликон, леукодендрон |
| `seasonal` | peonies | амарилл, гиппеаструм, нобилис, илекс, мимоза, георгин |
| `spring` | tulips, ranunculus, anemones | нарцисс, гиацинт, мускари |
| `wedding` | lisianthus, hydrangeas, ranunculus, roses/decorative | White O'Hara, Playa Blanca |
| `premium` | peonies | David Austin, фаленопсис, цимбидиум, Protea King, premium |

Один товар может получить несколько тегов. Ручные теги не перезаписываются.

### colors при импорте

`colors` берётся из AI-обогащения (`enriched.color`) и пишется в `products.colors` как `[color]` при INSERT или UPDATE (если поле пустое). Ручные значения не трогаются.

### Поведение при INSERT (новый товар)

Устанавливается всё: `name`, `price`, `qty`, `arrival_date = today`, `length_cm` из парсера, `country_iso` из имени файла, `category`, `subcategory`, `variety_type`, `pack_size`, `display_name` из TM переводчика (если найден — очищенный), `colors` из AI, `tags` из авто-тегирования.

### Деактивация — категориальная (26.05.2026)

После обработки всех файлов клиент вызывает `POST /api/import-xls/finalize`:
```json
{ "keepIds": [1, 5, 23, ...], "categories": ["cut", "pot"] }
```
Деактивируются только товары **тех категорий, которые были в импорте**, отсутствующие в `keepIds`. Это позволяет одновременно загружать срезку и горшечные без взаимного обнуления.

⚠️ Старый флаг `isLast` **удалён** из API. Деактивация больше не происходит внутри файловой обработки.

### Страна и категория из имени файла

- `countryFromText(filename)` → ISO код (EC/KE/NL/CN/CO/IL/ET/EG)
- Наличие «горшок»/«горш» в имени → `category = 'pot'`, иначе `cut`

### Несколько одинаковых строк в одном XLS

Если XLS содержит несколько строк с одинаковым `name` (разные партии по разным ценам) — каждая следующая строка перезаписывает предыдущую через UPDATE (последняя цена и qty победят). Это компромисс плоской схемы.

### Тег "Акция" и previous_price

- `previous_price` заполняется импортом автоматически при снижении цены
- UI показывает тег **АКЦИЯ** + зачёркнутую старую цену когда `previous_price > price`
- При повышении цены `previous_price` не сбрасывается автоматически
- Для снапшота текущих цен (перед первым импортом с уценкой): `UPDATE products SET previous_price = price WHERE previous_price IS NULL`

## Фото товаров

- **Хранилище**: Supabase Storage, бакет `product-images`
- **Основное фото** (`image_url`): путь `{slugify(name)}.{ext}`
- **Второе фото** (`campaign_image_url`): путь `campaign_{slugify(name)}.{ext}`
- **Загрузка**: клик по миниатюре в строке AdminTable → выбор файла или камера
- **Ховер-эффект в каталоге**: GridCard переключается на `campaign_image_url` при наведении + точки-переключатели
- **Генератор карточек**: использует `campaign_image_url` если есть, иначе `image_url`

## Логика резервирования

1. **POST /api/checkout** — клиент добавляет товары в корзину
   - Проверяет доступное количество (qty минус активные резервирования)
   - Создаёт или обновляет заказ со статусом `pending`
   - Создаёт резервирование на 30 минут
   - Возвращает `order_id` и `expires_at`

2. **POST /api/cancel-order** — отмена заказа
   - Меняет статус на `cancelled`
   - Удаляет связанные резервирования
   - Пересчитывает остатки

3. **Триггер trg_confirm_order** — при смене статуса на `confirmed`
   - Списывает остатки из `products.qty` на основе `order_items`
   - Удаляет резервирования
   - Логирует в `inventory_ledger`

## Критические замечания

⚠️ **SUPABASE_SERVICE_ROLE_KEY не работает в serverless на Vercel**
- **Решение**: Используется `createClient()` (client role) + RLS политики
- **Статус**: Постоянное ограничение архитектуры Vercel

⚠️ **`stock_available` view не содержит `price`**
- Не использовать для получения цен — брать напрямую из `products.price`

## API Маршруты

| Маршрут | Метод | Описание |
|---------|-------|---------|
| `/api/products` | GET | Каталог товаров; `?catalog=1` — включая qty=0 (для кампаний); возвращает `farm`, `stems_per_pack` |
| `/api/admin/products` | GET | Товары для AdminTable с резервами |
| `/api/checkout` | POST | Создать заказ и резервирование |
| `/api/cancel-order` | POST | Отменить заказ |
| `/api/confirm-order` | POST | Подтвердить заказ (триггер списания) |
| `/api/update-order-qty` | POST | Изменить количество в заказе |
| `/api/my-orders` | GET | Заказы текущего клиента |
| `/api/import-xls` | POST | Импорт товаров из Excel; возвращает `importedIds[]` и `category` |
| `/api/import-xls/finalize` | POST | Категориальная деактивация после всех файлов батча |
| `/api/import-oz-preorder` | POST | Upsert карточек OZ предзаказа + staging; ключ — `oz_product_code` |
| `/api/preorder/launch` | POST | Заморозка: staging → campaign_items, публикация акции |
| `/api/preorder/[id]/join` | POST | Запрос доступа в комнату по коду |
| `/api/preorder/[id]/admit` | POST | Одобрение/отклонение запроса (admin/manager) |
| `/api/reserve` | POST | Создать резервирование |
| `/api/cron/cleanup` | GET | Cron: удаляет истекшие резервирования (защита CRON_SECRET) |

## Роли и доступ

- **admin** — полный доступ ко всем данным, импорт товаров
- **manager** — управление остатками, подтверждение заказов
- **client** — просмотр каталога, создание и управление своими заказами

Роли хранятся в `profiles.role`, проверяются на клиенте через `useAuthStore`.

## RLS статус (актуально на 01.05.2026)

RLS **отключён** на таблицах: `clients`, `orders`, `order_items`, `reservations`, `products`, `varieties`, `inventory_ledger`

RLS **включён только** на: `profiles`

## OZ Export — предзаказы (source='oz_preorder') — актуально с 31.05.2026

Конвейер предзаказов: менеджер копирует ссылки с сайта OZ → Python-парсер перехватывает XHR `stockLines/availability` → POST в `/api/import-oz-preorder` → карточки в `products`.

### Ключ дедупликации: `oz_product_code`

32-символьный UUID товара из OZ. Уникальный индекс `products_oz_product_code_uniq` (NULLS DISTINCT — спот-товары с `oz_product_code=NULL` не конфликтуют).

### Роут `/api/import-oz-preorder` (POST)

Принимает JSON:
```json
{
  "source": "oz_preorder",
  "items": [
    {
      "oz_product_code": "7416DE50033E53D302D9C8F4AEC8156A",
      "name": "Rosa ec queens crown",
      "image_url": "https://img.ozexport.nl/...jpg",
      "category": "cut",
      "order_multiple_stems": 25,
      "packaging_unit_stems": 125,
      "vbn_unit_code": "996"
    }
  ]
}
```

Маппинг в `products`:
| поле JSON | колонка |
|---|---|
| `oz_product_code` | `oz_product_code` (ON CONFLICT ключ) |
| `name` | `name` |
| `image_url` | `image_url` (только если пустое) |
| `category` | `category` |
| `order_multiple_stems` | `pack_size` |
| `packaging_unit_stems` | `stems_per_pack` |
| `vbn_unit_code` | `container_code` |
| — | `source='oz_preorder'`, `is_active=false`, `qty=0` (только INSERT) |

**INSERT** → `is_active=false`, `qty=0` — не попадает в спот-витрину; видим только через `campaign_items`.  
**UPDATE** → обновляет name, image_url (если пусто), pack_size, stems_per_pack, container_code. Цену/qty/is_active не трогает.

Возвращает: `{ created, updated, errors, errorLog[] }`

**Авторизация (двойная):**
- Скриптовый путь (парсер): заголовок `x-import-secret: <OZ_IMPORT_SECRET>` — сессия не нужна
- Браузерный путь (будущая AdminUI): сессия admin/manager через Supabase Auth

`OZ_IMPORT_SECRET` — env-переменная на Vercel, в репо не хранится.

**Расширенный контракт (с campaign_id и lines[]):**
```json
{
  "source": "oz_preorder",
  "campaign_id": 12,
  "items": [{
    "oz_product_code": "7416DE...",
    "name": "Rosa ec queens crown",
    "order_multiple_stems": 25,
    "packaging_unit_stems": 125,
    "lines": [
      { "oz_line_id": "31033487015_36", "stock_type": "STOCK",
        "delivery_date": "2026-06-01", "available_stems": 225, "purchase_eur": 0.77 }
    ]
  }]
}
```
Если `campaign_id` задан — каждая строка `lines[]` пишется в `campaign_staging`.
Если `campaign_id` не задан — только upsert карточки (обратная совместимость).

Возвращает: `{ created, updated, staging_rows, errors, errorLog[] }`

---

## Закрытая комната предзаказов — актуально с 31.05.2026

### Витрина предзаказа `/preorder/[id]` — раскладка каталога (31.05.2026)

Фаза `room` переведена на 3-колоночную раскладку основного каталога:
- **Слева** — фильтры: дата поставки (`oz_delivery_date`, мульти-чекбокс), тип склада (`oz_stock_type`: STOCK/VMP/PROMOTION), сортировка по цене. Фильтрация клиентская.
- **Центр** — сетка карточек (`minmax(160px, 1fr)`): фото, название, дата, тип склада, цена ₸/стебель, кратность/остаток, степпер (шаг=`pack_size`, мин=`min_qty`, макс=`oz_available_stems`).
- **Справа** — панель деталей товара (при клике на карточку) + корзина. Кнопка «Оформить» вызывает Server Action `checkoutPreorder`.
- Мобильный: filter/detail как bottom sheets + нижний bar (зеркалит `CatalogLayout`).
- Корзина — in-memory `useState`, без localStorage. CSS переменные каталога (`--accent`, `--bg2`, `--border`, `--radius-*`).
- Прочие фазы (join/pending/ordered) — без изменений.

### Жизненный цикл акции
```
draft → ингест линий в campaign_staging → менеджер проверяет/выбирает
      → POST /api/preorder/launch (заморозка цен в campaign_items) → published
      → клиент стучится по коду → менеджер впускает → предзаказы → closed
```

### Новые таблицы (миграция preorder_room_staging_access)

**`campaign_staging`** — черновик линий до заморозки. Менеджер снимает/ставит `is_selected`,
видит preview цены. При запуске акции — `is_selected=true` строки идут в `campaign_items`.

**`campaign_access`** — доступ к комнате по Zoom-модели:
- `status`: `pending` → `approved` | `denied`
- `access_token`: выдаётся при впуске, кладётся в cookie браузера

**Новые колонки `campaigns`**: `access_code text` (6 символов, генерится при публикации),
`markup_percent`, `eur_kzt_rate` (снимок настроек на момент запуска).

### Безопасность доступа (security fix 31.05.2026)

- **`campaign_items` SELECT** — закрыт для anon/public. Политика `campaign_items_select_admin` — только admin/manager.
- **`get_preorder_room(p_campaign_id, p_token)`** — SECURITY DEFINER RPC, единственный публичный путь к позициям. Проверяет `access_token` в `campaign_access`. Доступен anon/authenticated.
- **`campaign_access`** — RLS включён, политика `campaign_access_admin_all` — только admin/manager. Клиентские операции через серверные роуты.
- **`get_preorder_access_status(p_campaign_id, p_phone)`** — SECURITY DEFINER, читает статус+токен конкретного телефона без раскрытия чужих данных.

### Роуты

| Роут | Метод | Описание |
|---|---|---|
| `/api/preorder/launch` | POST | Заморозка: staging → campaign_items, публикация, генерация access_code |
| `/api/preorder/[id]/join` | POST | Клиент: `{ code, phone, name }` → pending в campaign_access |
| `/api/preorder/[id]/admit` | POST | Менеджер: `{ access_id, action: approve\|deny }` → токен в БД (закрыт x-admin-secret) |
| `/api/preorder/[id]/status` | GET | Клиент: `?phone=...` → `{ status, access_token? }` (polling) |
| `/preorder/[id]` | page | Витрина комнаты: вход по коду или отображение позиций через RPC |
| `/admin/campaigns/[id]/staging` | page | Стейджинг: галки + preview цен + кнопка «Запустить» |
| `/admin/campaigns/[id]/requests` | page | Очередь заявок: список campaign_access, кнопки «Впустить»/«Отклонить» |
| `/admin/preorders` | page | Все предзаказы (campaign_orders): фильтры, раскрытие позиций, смена статуса |

### Раздел «Предзаказы» (`/admin/preorders`, 31.05.2026)

Источник: `campaign_orders` + `campaign_order_items` → `campaign_items` → `products`.

**Цепочка статусов** (enum `order_status`, общий с `orders`):
```
pending → confirmed → in_transit → arrived → assembling → assembled → delivered
                                                                         ↑
                                                               cancelled (из любого этапа)
```
Русские подписи: Оформлен / Подтверждён / В пути / На складе / Собирается / Собран / Выдан / Отменён.

`in_transit` и `arrived` — новые значения enum, добавлены для предзаказов. Обычные `orders` эти статусы не используют.

**Смена статуса** — через Server Action `updatePreorderStatus` (обновляет `status` + `updated_at`). Никаких открытых write-роутов.

**«Перевести в заказ»** (Заход 2, не реализован) — disabled-кнопка при статусе `arrived`. Логика перевода требует складской обвязки.

### Server Actions (src/app/admin/preorder-actions.ts)

| Функция | Описание |
|---|---|
| `launchCampaign(params)` | Заморозка стейджинга → campaign_items, публикует кампанию |
| `admitRequest({ campaign_id, access_id, action })` | Впускает или отклоняет заявку (approve/deny) |
| `getAccessRequests(campaign_id)` | Читает campaign_access через createAdminClient (обходит RLS) |
| `updatePreorderStatus({ order_id, status })` | Меняет статус campaign_orders + updated_at |

Все Server Actions используют `createAdminClient()` (service role) — секрет не попадает в браузерный бандл.

### Вход в комнату (поток токена)
1. Клиент вводит код + телефон → `POST /join` → `status=pending` в БД
2. Страница опрашивает `GET /status?phone=...` каждые 5 сек
3. Менеджер нажимает «Впустить» → токен записывается в `campaign_access`
4. Следующий poll → `{ status: approved, access_token }` → cookie + загрузка витрины через RPC

### Корзина и оформление предзаказа (31.05.2026)

**Корзина** — React `useState`, в памяти, без localStorage. Поля: `campaign_item_id, label, price, qty, pack_size, available`. Шаг = `pack_size`, мин = `min_qty`, макс = `oz_available_stems`. Sticky bar внизу витрины показывает сумму и кнопку «Оформить».

**Checkout flow** (`checkoutPreorder` Server Action, `src/app/admin/preorder-actions.ts`):
1. Читает `preorder_token_{campaign_id}` из cookie (cookies() из next/headers, не от клиента)
2. Валидирует токен через `campaign_access` → получает `guest_phone`, `guest_name`
3. Матч к `profiles` по `normalizePhone(phone)` → `profiles.id` = Supabase Auth UUID = `client_id` в campaign_orders (чтобы кабинет нашёл по `user.id`)
4. Не найден → гость: `client_id=null`, `guest_phone` + `guest_name`
5. Цены и лимиты берёт из `campaign_items` на сервере (не из тела запроса)
6. Проверяет кратность (`pack_size`) и лимит партии (`oz_available_stems`)
7. Создаёт `campaign_orders` + `campaign_order_items`; **без reservations**
8. Telegram-уведомление

**Кабинет** (`/cabinet`): секция «Мои предзаказы» уже реализована. Грузит `/api/campaigns/orders?client_id=user.id` (user.id = Supabase Auth UUID). Показывает: название акции, статус, позиции (название, qty, сумма), итого ₸, метку «переведён в заказ #N» если `converted_to_order_id` заполнен.

### Pricing layer (БД-миграция `oz_preorder_pricing_layer`, применена 31.05.2026)

- `products.oz_product_code text UNIQUE`
- `campaign_items` доп. колонки: `oz_line_id`, `oz_stock_type`, `oz_delivery_date`, `oz_available_stems`, `oz_purchase_eur`, `markup_percent`, `eur_kzt_rate`
- `app_settings` ключи: `preorder_markup_percent='35'`, `preorder_eur_kzt_rate='525'`, `preorder_round_to='1'`
- Функция `calc_preorder_price_kzt(purchase_eur, markup_pct, rate, round_to)` → ₸/стебель

### Phase 2 (не реализовано)

Серверный экшен «старт акции»: читает `app_settings`, вызывает `calc_preorder_price_kzt`, записывает строки в `campaign_items` (один товар = несколько партий с разными `oz_line_id` и датами).

⚠️ Старый статичный OZ-каталог (`source='oz_export'`, 156 карточек срезки) **удалён 31.05.2026**. Трек `source='oz_export'` больше не используется. Новый трек — `source='oz_preorder'`.

---

## Импорт каталога поставщиков (OZ / Waterdrinker) — актуально с 27.05.2026

Парсинг сайтов поставщиков → JSONL → скрипты импорта → `products`.  
Цель: предзаполнить базу фотографиями, цветами, подкатегориями до прихода товара в 1С.

| Скрипт | Поставщик | Категория | Запуск |
|--------|-----------|-----------|--------|
| `scripts/import-oz.mjs` | OZ Export | Срезка (`cut`) | `node --env-file=.env.local scripts/import-oz.mjs [Category\|ALL] [file.jsonl]` |
| `scripts/import-waterdrinker.mjs` | Waterdrinker | Горшечные (`pot`) | `node --env-file=.env.local scripts/import-waterdrinker.mjs [Category\|ALL] [file.jsonl]` |

JSONL-файлы — вывод парсера `waterdrinker-scraper` (Desktop).

**Ключевые правила UPDATE:**
- `colors`, `image_url` — обновляются только если поле пустое
- `display_name`, `price`, `length_cm` — не трогаются
- `qty = 999`, `price = 999` у OZ — плейсхолдеры, реальные значения приходят из XLS
- `pack_size = 1` у OZ — кратность заказа (редактируется вручную); `stems_per_pack` = `quantity_stems` из OZ

⚠️ **Маппинг 1С → каталог не реализован.** XLS-импорт ищет товар по `products.name`.  
Если точного совпадения нет — создаётся дубль. Решение маппинга в плане.

Подробности: `docs/CATALOG_IMPORT.md`

## База знаний проекта

| Файл | Тема |
|------|------|
| `docs/CATALOG_IMPORT.md` | Импорт каталога поставщиков (OZ, Waterdrinker) — актуально |
| `docs/IMPORT_SYSTEM.md` | Импорт XLS из 1С — ⚠️ устарело (описывает batches/stock до 25.05.2026) |
| `docs/STOCK_MANAGEMENT.md` | Архитектура остатков |
| `docs/AI_TRANSLATOR.md` | AI-переводчик инвойсов, `translation_memory` |
| `docs/NAMING_SYSTEM_STATE.md` | Состояние нейминга, дубли товаров |

## Важные файлы и папки

```
src/
├── app/
│   ├── api/
│   │   ├── import-xls/route.ts          # Импорт XLS — основная логика
│   │   ├── import-xls/finalize/route.ts # Деактивация после батча (категориальная)
│   │   ├── products/route.ts            # Каталог (включает previous_price, campaign_image_url)
│   │   └── admin/products/route.ts      # Админ-таблица
│   ├── admin/
│   │   ├── page.tsx              # Открывается на вкладке "Остатки"
│   │   └── generate-cards/       # Генератор карточек для WhatsApp
│   └── product/[id]/             # Страница товара (клиентская)
├── components/
│   ├── admin/
│   │   ├── AdminPageClient.tsx   # Табы: Остатки (default), Заказы, Клиенты...
│   │   ├── AdminTable.tsx        # Таблица остатков + загрузка фото
│   │   ├── ProductEditModal.tsx  # Редактирование товара
│   │   └── ImportXLS.tsx         # Загрузка XLS файлов
│   └── catalog/
│       └── ProductGrid.tsx       # GridCard с ховер-эффектом 2-го фото; показывает флаг страны + ферму курсивом
├── lib/
│   ├── supabase/
│   │   ├── client.ts     # Singleton Supabase client (браузер)
│   │   └── server.ts     # Supabase client (сервер/API)
│   ├── card-generator.ts # Canvas-генератор карточек товаров
│   ├── parse-nomenclature.ts # Парсер названий из 1С (длина, горшок, категория)
│   ├── auth-store.ts     # Zustand: user, role, phone, isAuthed
│   ├── cart-store.ts     # Zustand: CartItem[]
│   ├── products-store.ts # Zustand: products[], filteredCount
│   ├── filter-store.ts   # Zustand: все фильтры каталога
│   ├── colors.ts         # Палитра COLORS — единая точка
│   ├── use-mobile.ts     # useIsMobile() — < 768px
│   └── phone.ts          # normalizePhone()
```

> ⚠️ `ProductCard.tsx` используется только в `PriceTable.tsx`. Основной каталог — `GridCard` внутри `ProductGrid.tsx`.

## Environment Variables

| Переменная | Описание | Где использовать |
|------------|---------|------------------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL Supabase проекта | Браузер + Backend |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public (anon) key | Браузер + Backend |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (**не использовать на Vercel!**) | Только локально |
| `CRON_SECRET` | Защита cron endpoints | Vercel |

## Known Issues

### 🔴 SUPABASE_SERVICE_ROLE_KEY не работает в Vercel serverless
- **Решение**: `createClient()` (client role) + RLS

### 🟡 Realtime обновления каталога не работают
- Пользователь должен перезагрузить страницу

### 🟡 WhatsApp уведомление требует разрешения всплывающих окон

## Roadmap

- **Маппинг 1С → каталог** — таблица `product_aliases(raw_name, product_id)`: XLS-импорт сначала ищет алиас, потом `products.name`; первичная привязка ручная через UI + опционально AI
- **Переводы OZ-товаров** — display_name для OZ-карточек (English → Russian)
- **Нормализация дублей** — слияние товаров с одинаковым сортом но разными `name`

## Локальная разработка

```bash
NEXT_PUBLIC_SUPABASE_URL=<url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<только локально>

npm install
npm run dev
npm run build
```

## Развёртывание

- **Репозиторий**: GitHub → автодеплой на Vercel при push в main
- **База данных**: Supabase (один проект для prod и dev)

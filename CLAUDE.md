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

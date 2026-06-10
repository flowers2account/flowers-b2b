# Flowers B2B — Оптовый склад цветов

## Описание проекта

B2B платформа для оптовой торговли цветами. Система управления товарами, заказами, резервированием остатков и подтверждением отгрузки.

## Стек технологий

- **Frontend**: Next.js 16, React, Tailwind CSS, Zustand (состояние)
- **Backend**: Next.js API Routes (Node-сервер, `output: 'standalone'`)
- **База данных**: Supabase (PostgreSQL + RLS)
- **Хостинг (prod)**: собственный VPS hoster.kz `109.235.118.214` (Астана, Ubuntu 24.04) — Node 22 + pm2 + nginx. Деплой push→main через GitHub Actions. См. `docs/INFRA.md`
- **Хостинг (preview)**: Vercel (`flowers-b2b-phi`) — стейджинг/превью
- **Оплата**: epay / Halyk Bank (тестовый контур работает, ждём боевые ключи + DNS). См. `docs/PAYMENTS.md`
- **Аутентификация**: Supabase Auth (телефон + PIN, через @supabase/supabase-js — @supabase/ssr убран)

## Прод, реквизиты, статус (карта входа)

- **Домен**: `uralskflowers.kz` (регистратор Megagroup) — ⏳ ждёт DNS; пока прод доступен по IP без TLS
- **Бренд**: «Цветы Уральска»
- **Реквизиты** (`src/config/company.ts` — единый источник): ИП Тропин Валерий Алексеевич, ИИН `610803301378`, ИИК `KZ256017181000005303` (АО «Народный Банк Казахстана», БИК `HSBKKZKX`, КБЕ `19`), тел `+7 700 757 5243`, e-mail `opt.uralsk@gmail.com`
- **Статус**: тестовый контур оплаты epay работает; ждём DNS (Megagroup) и боевые ключи банка. Чек-листы — в `docs/INFRA.md` и `docs/PAYMENTS.md`.
- **Вход на сервер**: `ssh -i deploy_vps.key deploy@109.235.118.214`

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
- Наличие «горшок»/«горш» в имени → `category = 'pot'`
- Наличие «сопут»/«упаков»/«расход» в имени → `category = 'accessories'`
- Иначе → `cut`

⚠️ Файл `фурн.xls` (фурнитура) не содержит ни одного из этих слов — определится как `cut`. Для загрузки аксессуаров через этот файл добавить «фурн» в keywords или использовать прямой скрипт.

### Подкатегории accessories при импорте (keyword-маппинг)

| Паттерн | subcategory |
|---------|-------------|
| набор.*коробок / коробок.*набор | `gift_boxes` |
| упаков / лент / плёнк / бумаг / флорист / … | `packaging` |
| горшок / горш / кашпо / фонтан / вазон | `pots` |
| грунт / торф / перлит / субстрат / … | `soil` |
| удобрен / fertika / кристалон / … | `fertilizers` |
| газон / укрывной / агрополотно / … | `lawns` |
| садов / огород / семен / … | `garden` |
| искусствен | `artificial` |
| игрушк | `toys` |

### Несколько одинаковых строк в одном XLS

Если XLS содержит несколько строк с одинаковым `name` (разные партии по разным ценам) — каждая следующая строка перезаписывает предыдущую через UPDATE (последняя цена и qty победят). Это компромисс плоской схемы.

### Тег "Акция" и previous_price

- `previous_price` заполняется импортом автоматически при снижении цены
- UI показывает тег **АКЦИЯ** + зачёркнутую старую цену когда `previous_price > price`
- При повышении цены `previous_price` не сбрасывается автоматически
- Для снапшота текущих цен (перед первым импортом с уценкой): `UPDATE products SET previous_price = price WHERE previous_price IS NULL`

## Фото товаров

- **Хранилище**: Supabase Storage, бакет `product-images`
- **Основное фото** (`image_url`): путь `{slugify(name)}_timestamp.jpg`
- **Второе фото** (`campaign_image_url`): путь `campaign_{slugify(name)}_timestamp.jpg`
- **Дополнительные фото** (`extra_images`): массив URL, хранится в `products.extra_images text[]`
- **Загрузка**: клик по миниатюре в строке AdminTable → выбор файла или камера
- **Ховер-эффект в каталоге**: GridCard переключает все N фото (image_url + campaign_image_url + extra_images[]) при движении мыши — ширина карточки делится на N зон; точки-переключатели
- **Генератор карточек**: использует `campaign_image_url` если есть, иначе `image_url`
- **Рекомендуемое соотношение**: **1:1 (квадрат)** — карточка каталога `aspect-ratio: 1/1`

### Удаление фона — клиентская сторона через @imgly/background-removal (04.06.2026)

При загрузке фото в AdminTable (оба слота — основное и кампанийное) фон удаляется прямо в браузере:

1. Даунскейл входного файла до max 1500px (canvas)
2. `removeBackground(blob)` из `@imgly/background-removal` → прозрачный PNG (WASM/ONNX, модель кешируется при первом запуске)
3. Композитинг: canvas залит `BG_TINT = '#FFFFFF'` (белый), поверх — PNG без фона
4. Экспорт → JPEG 88%, max 1200px
5. Загрузка в Supabase Storage клиентом (с сессией) → UPDATE products

**Первый запуск**: браузер скачивает модель ONNX с CDN (~30–50 МБ), кешируется навсегда. Последующие вызовы — быстро.

**Индикация**: «удаляю фон…» → «сохраняю…» на миниатюре при наведении.

⚠️ Только ручная загрузка по «+». Серверного роута для обработки фото больше нет — удалён.

### Загрузка extra_images вручную (скриптом)

```bash
node --env-file=.env.local --input-type=module <<'EOF'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const bytes = readFileSync('/path/to/photo.jpg')
const { } = await sb.storage.from('product-images').upload('extra_slug_ts.jpg', bytes, { contentType: 'image/jpeg', upsert: true })
const url = sb.storage.from('product-images').getPublicUrl('extra_slug_ts.jpg').data.publicUrl
await sb.from('products').update({ extra_images: [url] }).eq('id', PRODUCT_ID)
EOF
```

## Логика резервирования

1. **POST /api/checkout** — клиент добавляет товары в корзину
   - Проверяет доступное количество (qty минус активные резервирования)
   - Создаёт заказ со статусом `pending`, `payment_status='unpaid'`
   - Создаёт резервирование на 30 минут
   - Возвращает `order_id` и `expires_at`
   - **⚠️ Уведомления НЕ отправляются** — только после подтверждения оплаты
   - Заказ скрыт в админ-канбане до прихода оплаты (pending+unpaid → не виден)

1а. **POST /api/payments/init** → **POST /api/payments/postlink** — платёжный шаг
   - При успешной оплате (code=ok): `payment_status='paid'`, заказ появляется в админке
   - **Telegram + WhatsApp уведомления** отправляются только здесь (postlink success)
   - Уведомление содержит полный состав заказа, клиента, сумму и маску карты

2. **POST /api/cancel-order** — отмена заказа
   - Меняет статус на `cancelled`
   - Удаляет связанные резервирования
   - Пересчитывает остатки

3. **Триггер trg_confirm_order** — при смене статуса на `confirmed`
   - Списывает остатки из `products.qty` на основе `order_items`
   - Удаляет резервирования
   - Логирует в `inventory_ledger`

## Критические замечания

⚠️ **SUPABASE_SERVICE_ROLE_KEY** — используется в десятках API routes через `createAdminClient()` и работает. Ранее задокументированное ограничение «не работает в Vercel serverless» устарело.

⚠️ **PostgREST `max_rows` = 1000 — жёсткий лимит**
- `.limit(N)` где N > 1000 возвращает ошибку → `data=null` → пустой каталог
- **Решение**: пагинация через `.range(from, from+PAGE-1)` в цикле (PAGE=900)
- Реализовано в `src/app/page.tsx` → `fetchAllProducts()`: 2 запроса по 900 строк покрывают текущие 1725 товаров
- При росте каталога цикл автоматически добавит третий запрос

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
| `/api/orders/[id]` | PATCH | Смена статуса заказа; вызывает `updateLeadStage` для amoCRM |
| `/api/orders/[id]/assemble` | POST | Сборка заказа → статус assembled; вызывает `updateLeadStage` |
| `/api/manager-order` | POST | reserved/delivered менеджером; вызывает `updateLeadStage` |

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

**Смена статуса** — через Server Action `updatePreorderStatus` → RPC `admin_set_preorder_status`. Никаких открытых write-роутов.

**Массовая смена статуса** (31.05.2026) — два логистических перехода делаются разом для всех заказов кампании:
- `confirmed → in_transit` («Вся партия → В пути»)
- `in_transit → arrived` («Вся партия → На складе»)

Кнопки появляются в `/admin/preorders` когда выбрана конкретная акция в фильтре и есть заказы в соответствующем статусе. RPC `admin_bulk_preorder_status(p_campaign_id, p_from, p_to)` — SECURITY DEFINER, белый список переходов на уровне БД. Server Action `bulkPreorderStatus({ campaign_id, from, to })` → возвращает число обновлённых. Остальные стадии (confirmed-подтверждение, assembling, delivered) — только индивидуально.

### Сборка / корректировка / выдача предзаказов (31.05.2026)

Все операции работают ТОЛЬКО с `campaign_order_items` / `campaign_orders`. Склад (`products`, FIFO) **не трогается**.

**Поля `campaign_order_items` (добавлены миграцией `campaign_order_items_assembly_fields`):**

| Поле | Тип | Описание |
|---|---|---|
| `qty_ordered` | int NOT NULL | Что заказал/отредактировал менеджер (исходный и после корректировки) |
| `qty_actual` | int NULL | Что фактически собрано (заполняется при сборке) |
| `is_removed` | bool DEFAULT false | Позиция убрана из заказа |

**Сборка** (`arrived`/`assembling` → `assembled`):
- Кнопка «📋 Собрать» при `arrived`, «📋 Завершить сборку» при `assembling` → `PreorderAssemblyModal`
- Модалка: каждая позиция — кнопка убрать + поле qty_actual (предзаполнен qty_ordered)
- Сохранение → RPC `admin_assemble_preorder(p_order_id, p_items jsonb)` → обновляет qty_actual/is_removed, пересчитывает total, ставит `assembled`
- Server Action `assemblePreorder({ order_id, items: [{id, qty_actual, is_removed}] })`

**Корректировка** (любой нетерминальный статус):
- Кнопка «✏️ Корректировка» → `PreorderEditModal`
- Модалка: изменить qty_ordered, убрать позицию, добавить из campaign_items акции
- Добавление позиций: дропдаун через `getCampaignItemsForOrder(campaign_id)` → RPC `admin_get_campaign_items(p_campaign_id)` — только is_active=true
- Цена добавленной позиции — строго из `campaign_items.price` (на сервере), не от клиента
- Комментарий → аппендится в `campaign_orders.notes`
- Сохранение → RPC `admin_save_preorder_edits(p_order_id, p_updates, p_new_items, p_note)` → пересчитывает total
- Server Action `savePreorderEdits({ order_id, updates, new_items, note? })`

**Выдача** (`assembled` → `delivered`): обычная смена статуса через `updatePreorderStatus`.

**Таблица позиций** в развёрнутом заказе: is_removed-позиции зачёркнуты + opacity 40%. При статусах assembled/delivered показывается qty_actual вместо qty_ordered.

### Server Actions (src/app/admin/preorder-actions.ts)

| Функция | Описание |
|---|---|
| `launchCampaign(params)` | Заморозка стейджинга → campaign_items, публикует кампанию |
| `admitRequest({ campaign_id, access_id, action })` | Впускает или отклоняет заявку (approve/deny) |
| `getAccessRequests(campaign_id)` | Читает campaign_access через createServerClient (сессионный клиент) |
| `updatePreorderStatus({ order_id, status })` | → RPC `admin_set_preorder_status` |
| `bulkPreorderStatus({ campaign_id, from, to })` | → RPC `admin_bulk_preorder_status`; только confirmed→in_transit и in_transit→arrived |
| `assemblePreorder({ order_id, items })` | → RPC `admin_assemble_preorder`; ставит assembled, пересчитывает total |
| `savePreorderEdits({ order_id, updates, new_items, note? })` | → RPC `admin_save_preorder_edits`; корректировка, пересчёт total |
| `getCampaignItemsForOrder(campaign_id)` | → RPC `admin_get_campaign_items`; позиции акции для дропдауна |

**Паттерн доступа к БД**: admin-функции чтения/записи используют SECURITY DEFINER RPC через `createServerClient()` (anon-ключ). Это обходит RLS без service role key, который ненадёжен в Vercel serverless. Паттерн идентичен `get_preorder_room`. ⚠ Tech-debt: RPCs открыты для anon-роли, защита только клиентским гардом /admin — нужен auth-аудит перед запуском.

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
| `docs/INFRA.md` | **VPS, деплой (deploy-vps.yml), nginx/pm2/certbot, env, чек-лист «ждёт DNS»** — актуально 06.06 |
| `docs/PAYMENTS.md` | **Оплата epay/Halyk: поток, схема БД, тест↔бой, грабли, юр.слой** — актуально 06.06 |
| `docs/DESIGN-CHANGES.md` | **Журнал UI-изменений 27.05–06.06 (шрифты, футер, моб. UX, карточка товара)** |
| `docs/BANK_AUDIT_2026-06-04.md` | Аудит готовности к Halyk Bank (часть пунктов уже закрыта) |
| `docs/UX_DESIGN_BRIEF.md` | UX/дизайн-бриф (стратегия, аудитория) |
| `docs/CATALOG_IMPORT.md` | Импорт каталога поставщиков (OZ, Waterdrinker) — актуально |
| `docs/PHOTO_UPLOAD.md` | Загрузка фото + удаление фона (@imgly клиентская сторона) |
| `docs/DATABASE_SCHEMA.md` | Таблицы, views, триггеры, функции, FK-карта |
| `docs/ARCHITECTURE.md` | Стек, структура папок, API-роуты, Zustand-сторы |
| `docs/BUSINESS_LOGIC.md` | Жизненный цикл заказа, резервы, кампании |
| `docs/IMPORT_SYSTEM.md` | Импорт XLS из 1С — ⚠️ устарело (описывает batches/stock до 25.05.2026) |
| `docs/STOCK_MANAGEMENT.md` | Архитектура остатков |
| `docs/AI_TRANSLATOR.md` | AI-переводчик инвойсов, `translation_memory` |
| `docs/UMNICO_BOT.md` | ИИ-бот поддержки в Umnico (расходка): поток, ENV, разовая настройка, правка промптов |
| `docs/NAMING_SYSTEM_STATE.md` | Состояние нейминга, дубли товаров |
| `docs/KNOWN_ISSUES.md` | Известные баги |
| `docs/ROADMAP.md` | Планы развития |

## Важные файлы и папки

```
src/
├── app/
│   ├── api/
│   │   ├── import-xls/route.ts          # Импорт XLS — основная логика
│   │   ├── import-xls/finalize/route.ts # Деактивация после батча (категориальная)
│   │   ├── products/route.ts            # Каталог (включает previous_price, campaign_image_url); limit(5000) — только для API-пути
│   │   ├── admin/products/route.ts      # Админ-таблица
│   │   └── admin/process-image/route.ts # remove.bg: удаление фона, возвращает байты
│   ├── page.tsx                         # SSR каталог; force-dynamic + fetchAllProducts() (пагинация .range() по 900 строк)
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
│       └── ProductGrid.tsx       # GridCard с ховер-эффектом N фото; VARIANT_LABEL; VOLUME_RANGE_TEST
├── lib/
│   ├── supabase/
│   │   ├── client.ts     # Singleton Supabase client (браузер)
│   │   ├── server.ts     # Supabase client (сервер/API)
│   │   └── admin.ts      # createAdminClient() → service role
│   ├── amo.ts            # amoCRM API v4: contacts, leads, notes, sync functions
│   ├── card-generator.ts # Canvas-генератор карточек товаров
│   ├── parse-nomenclature.ts # Парсер названий из 1С (длина, горшок, категория)
│   ├── auth-store.ts     # Zustand: user, role, phone, isAuthed
│   ├── cart-store.ts     # Zustand: CartItem[]
│   ├── products-store.ts # Zustand: products[], filteredCount
│   ├── filter-store.ts   # Zustand: все фильтры (subgroup, volumeRanges добавлены)
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
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key | Только сервер (API routes) |
| `CRON_SECRET` | Защита cron endpoints | Vercel |
| `AMO_ACCESS_TOKEN` | Долгосрочный JWT токен amoCRM | Только сервер |
| `GOOGLE_GEMINI_API_KEY` | Ключ Gemini (переводы, ИИ-бот) | Только сервер |
| `NEXT_PUBLIC_GEMINI_MODEL` | Модель Gemini (`models/gemini-flash-lite-latest`) | Браузер + Backend |
| `UMNICO_API_TOKEN` | JWT Umnico (Настройки → API) — ИИ-бот поддержки | Только сервер |
| `UMNICO_BOT_USER_ID` | id сотрудника-бота в Umnico | Только сервер |

## ИИ-бот поддержки в Umnico (расходка) — актуально с 10.06.2026

Бот автоматически отвечает клиентам в чатах **Umnico** на вопросы по расходным
материалам (`category='accessories'`), опираясь на живые данные Supabase. Использует
уже подключённый Gemini (`models/gemini-flash-lite-latest`). **v1 = только расходка** —
цветы, заказ, доставку, оплату, скидки, жалобы бот не трогает (диалог остаётся менеджеру).

### Файлы

| Файл | Назначение |
|------|-----------|
| `src/app/api/webhooks/umnico/route.ts` | Приёмник вебхука (POST): фильтр `message.incoming`, дедуп по `messageId`, всегда 200 |
| `src/lib/umnico.ts` | Клиент Umnico API v1.3: `getSources`, `sendMessage`, `addTag` |
| `src/lib/bot/accessories-bot.ts` | Логика: классификация (Gemini JSON) → поиск (Supabase ILIKE) → ответ. **Системный промпт правится здесь** (`SYSTEM_PROMPT`) |

### Поток

1. Обрабатывается **только** `type==='message.incoming'` (всё остальное, особенно `message.outgoing`, → сразу 200 — анти-петля).
2. Дедуп повторных доставок по `messageId`.
3. Gemini-классификация → `{in_scope, keywords}`; вне области → ничего не шлём.
4. Supabase: `products` WHERE `category='accessories' AND is_active AND price>0 AND hidden_for_demo=false` + OR ILIKE по `name`/`display_name`, limit 20.
5. Gemini с системным промптом → короткий ответ **или** ровно `NO_ANSWER`.
6. Ответ ≠ `NO_ANSWER` → Umnico (`source` с `type='message'`) + тег `отвечено-ботом`. Иначе — менеджеру.

**Гардрейлы**: не обещает резерв/заказ/доставку; не отвечает на исходящие; дедуп; любая ошибка → 200.

**ENV**: `UMNICO_API_TOKEN`, `UMNICO_BOT_USER_ID` (плюс уже существующие `GOOGLE_GEMINI_API_KEY`, `NEXT_PUBLIC_GEMINI_MODEL`, `SUPABASE_SERVICE_ROLE_KEY`).

**Разовая настройка** (создание сотрудника-бота, регистрация вебхука, проверка) и правка
промптов — подробно в `docs/UMNICO_BOT.md`. Регистрация вебхука: `scripts/register-umnico-webhook.ts`.

## amoCRM интеграция — актуально с 04.06.2026

Аккаунт: `tropinvladislav1.amocrm.ru`. Авторизация: Bearer JWT из `AMO_ACCESS_TOKEN`.

### Константы (src/lib/amo.ts)

| Константа | Значение | Описание |
|-----------|---------|---------|
| `AMO_PIPELINE_ID` | 10853806 | Воронка «заявки с сайта» |
| `AMO_STATUS_NEW` | 85413462 | Этап «Новый» |
| `AMO_STATUS_RESERVED` | 85413466 | «В брони» |
| `AMO_STATUS_CONFIRMED` | 85413470 | «Подтверждён» |
| `AMO_STATUS_ASSEMBLING` | 86286418 | «В сборке» |
| `AMO_STATUS_ASSEMBLED` | 86286422 | «Готово к выдаче» |
| `AMO_STATUS_DELIVERED` | 142 | «Выдан» |
| `AMO_STATUS_CANCELLED` | 143 | «Отменён» |
| `CF_ORDERID` | 1394611 | Кастомное поле ORDERID (textarea) |
| `CF_DATA_DOSTAVKI` | 1394599 | Кастомное поле ДАТА_ДОСТАВКИ (textarea) |

### Функции (src/lib/amo.ts)

| Функция | Описание |
|---------|---------|
| `findContactByPhone(phones)` | GET `/contacts?query=` по каждому формату (+7/8), дедупликация, возвращает первый id или null. Обрабатывает 204. |
| `createContact({name, phone})` | POST `/contacts`, phone в field_code PHONE / WORK |
| `ensureContactName(id, name)` | Проверяет name контакта — если пустой или = телефону, PATCH с реальным именем (Умнико создаёт контакты без имён) |
| `createLead({...})` | POST `/leads` с contacts, tags, custom_fields |
| `addNote(leadId, text)` | POST `/leads/{id}/notes`, note_type=common |
| `syncOrderToAmo(orderId)` | Витринный заказ (orders) → контакт + сделка + примечание с позициями. Идемпотентно по amo_lead_id. |
| `syncPreorderToAmo(orderId)` | Предзаказ (campaign_orders) → то же самое |
| `updateLeadStage(orderId)` | Читает orders.amo_lead_id + status, PATCH status_id по маппингу |

**Retry**: 3 попытки на 429/5xx с задержкой 1с/2с/4с. На 4xx не ретраить.

### Маппинг статусов orders → этапы amoCRM

```
reserved   → В брони (85413466)
confirmed  → Подтверждён (85413470)
assembling → В сборке (86286418)
assembled  → Готово к выдаче (86286422)
delivered  → Выдан (142)
cancelled  → Отменён (143)
pending / cart / in_transit / arrived → не двигаем
```

### Где вызывается

- **Создание заказа** (`/api/checkout`): `syncOrderToAmo(orderId)` после INSERT, в try/catch, неблокирующе
- **Создание предзаказа** (`checkoutPreorder`): `syncPreorderToAmo(orderId)` аналогично
- **Смена статуса** (`/api/orders/[id]`, `/api/orders/[id]/assemble`, `/api/manager-order`): `updateLeadStage(orderId)` в конце, в try/catch

### Колонки в orders и campaign_orders

```sql
amo_lead_id       BIGINT  -- уникальный, partial index WHERE NOT NULL
amo_contact_id    BIGINT
amo_synced_at     TIMESTAMPTZ
amo_sync_attempts INT DEFAULT 0
amo_sync_error    TEXT
```

Примечание в сделке (addNote): список позиций с display_name, qty, price, итог; дата в таймзоне Asia/Oral.

## Каталог и фильтры — актуально на 06.06.2026

> Дельта 05–06.06 (подробности — `docs/DESIGN-CHANGES.md`): подкатегория по умолчанию при загрузке — `paper` (Бумага); добавлена подкатегория `dried` (Сухоцветы); единица «пог. м / шт» в корзине из unit/subcategory; свободный ввод телефона без маски + поддержка международных номеров.

### Витрина: только активные и свои товары

Все источники данных (`page.tsx`, `/api/products`) фильтруют:
```
is_active = true AND source IN ('uralsk_site', 'uralsk_1c')
```
Карточки поставщиков (waterdrinker, oz_preorder) на витрине не отображаются.

### Подкатегории accessories (полный список групп)

| Группа | Подкатегории |
|--------|-------------|
| Упаковка флористическая | film, film_bags |
| Упаковка и фурнитура | paper, ribbon, organza, mesh, tissue, felt, jute, gift_boxes, floral_foam, tools, cards_toppers, fillers, bags, napkins, paints, foamiran |
| Горшки, кашпо и фонтаны | pots, kashpo, fountains, vases, decor |
| Корзины | baskets (standalone) |
| Сад и удобрения | soil, fertilizers, plant_protection, growth_stim, garden_care, freshcut |
| Газоны и укрывной материал | cover_fabric, cover_film, artificial_grass, grass_seed |
| Прочие | garden, artificial, toys |

### Subgroup-вкладки (data-driven)

Для любой подкатегории с заполненным `products.subgroup` в FilterPanel появляются sub-вкладки «Тип». Порядок задан в `SUBGROUP_ORDER` (amo.ts):

| subcat | subgroups |
|--------|-----------|
| decor | Зоокашпо, Статуэтки и фигуры, Посуда, Сувениры, Деревянные изделия |
| paper | Крафт, Жатая, Калька, Атлас, Гофрированная, Двухсторонняя, Рисовая, Прочая |
| plant_protection | Инсектициды, Фунгициды, Гербициды, Родентициды |
| garden_care | Раскислители |

Фильтр по subgroup хранится в filter-store (`subgroup: string`), сбрасывается при смене subcat.

### Фильтр «Объём, л»

Показывается для subcat = pots / kashpo / soil. Диапазоны: до 5 л / 5–15 л / 15–40 л / 40+ л. Состояние: `volumeRanges: string[]` в filter-store.

### Прочие улучшения каталога

- **Сортировка по умолчанию**: новинки первыми, затем по убыванию `available qty`
- **Ховер-эффект**: переключает все N фото (image_url + campaign_image_url + extra_images[]) по горизонтальным зонам
- **Variant label**: зависит от subcategory — baskets→Комплектность, soil/fertilizers→Фасовка, plant_protection→Объём и т.д. (карта `VARIANT_LABEL` в ProductGrid)
- **Хлебные крошки** на странице товара: Каталог / Категория / Подкатегория — все кликабельны, устанавливают нужные фильтры
- **Поиск**: не персистируется в sessionStorage; сбрасывается при смене категории (`setCategory` включает `search: ''`)
- **Счётчик на свёрнутых группах**: рядом с заголовком collapsed-группы — сумма товаров во всех дочерних подкатегориях (функция `nodeCount`)

### Навигация «Назад» со страницы товара

`goToCategory()` / `goToSubcat()` / `goToCatalog()` вызывают `useFilters.getState()` напрямую — sessionStorage не читается при клиентской навигации. Позиция скролла: `sessionStorage['catalog-scroll']` → `catalog-scroll-restore`.

### Known Issues

### 🔴 PostgREST max_rows=1000 — нельзя делать `.limit(>1000)`
- Возвращает ошибку, `data=null`, каталог пустой
- **Решение**: `fetchAllProducts()` в `src/app/page.tsx` — цикл `.range()` по 900 строк

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

- **Prod**: GitHub Actions (`.github/workflows/deploy-vps.yml`) при push в `main` → сборка → rsync/scp артефактов → `pm2 reload` на VPS. Подробности — `docs/INFRA.md`
- **Preview**: Vercel (`flowers-b2b-phi`) — стейджинг
- **База данных**: Supabase (один проект для prod и preview)
- **Домен**: `uralskflowers.kz` (Megagroup) — ⏳ ждёт DNS (nginx-домен + certbot). Чек-лист в `docs/INFRA.md`

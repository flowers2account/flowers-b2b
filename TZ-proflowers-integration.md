# ТЗ: интеграция Proflowers → uralskflowers.kz (раздел «Под заказ / Биржа»)

Дай этот файл Claude Code в корне репозитория `flowers-b2b`. Сначала он должен
изучить проект, потом реализовать по разделам ниже. Все внешние факты про API
Proflowers уже разведаны и приведены здесь — заново их выяснять не нужно.

---

## 0. Сначала изучи проект (обязательно)

Прочитай и учти при реализации:
- `package.json` — версия Next.js, менеджер пакетов, есть ли уже `@supabase/supabase-js` / `@supabase/ssr`.
- Как заведён клиент Supabase (`lib/`, `utils/supabase/*`) — используй существующий паттерн, не создавай второй клиент.
- Как устроены API-роуты (App Router `app/api/**/route.ts` или Pages `pages/api`) и как оформлены существующие cron-эндпоинты, если есть.
- Есть ли уже `vercel.json` с секцией `crons`.
- Стиль работы с БД: чистый supabase-js, Drizzle, Prisma или SQL-миграции. Схему ниже приведи к этому стилю.
- Переменные окружения: как называются ключи Supabase (`SUPABASE_SERVICE_ROLE_KEY` и т.п.).

Правило: **новый код должен выглядеть как часть проекта**, а не как вставка.

Таблицы и данные Proflowers держать **изолированно** от основного каталога и
синхронизации с 1С — это отдельная сущность «товары под заказ у поставщика».

---

## 1. Что за источник (факты разведки)

Поставщик: **market.proflowers.kz** — Symfony SPA с JSON API. У аккаунта
«ТОО Цветы Уральска» на нём персональная скидка (спеццена).

**Авторизация (без двухфакторки):**
1. `GET https://market.proflowers.kz/prev/login` — получить сессионную cookie.
2. `POST https://market.proflowers.kz/prev/login_check` — тело form-urlencoded:
   `email=<PF_EMAIL>&password=<PF_PASS>&remember_me=on`
   Заголовки: `Referer: https://market.proflowers.kz/prev/login`, `Origin: https://market.proflowers.kz`.
   Ответ — редирект (302). Cookie сессии (`KZSESSIONID`) и `KZREMEMBERME` сохраняются в jar.
3. Проверка входа: `GET /client/profile-data` с заголовками
   `Accept: application/json`, `X-Requested-With: XMLHttpRequest` →
   должен вернуться JSON с `client.name` = «ТОО "Цветы Уральска"».

**Активные торговые дни:** `GET /trading-days/`
(заголовки `Accept: application/json`, `X-Requested-With: XMLHttpRequest`).
→ `activeTradingDays[]`, у каждого: `id`, `type` ("exchange" | "preorder"),
`name`, `dateTimeNormalized`, `nomenclatureId`. Сейчас активен один день типа
`exchange`. Когда откроется предзаказ, появится день типа `preorder` — код
должен обрабатывать оба одинаково.

**Список товаров (главный эндпоинт):**
```
GET /catalog/products?ipp=60&page={N}&sortOrder=ASC&sortBy=promotion
```
Заголовки ОБЯЗАТЕЛЬНЫ (иначе сервер отдаёт HTML-оболочку SPA вместо JSON):
```
Accept: application/json, text/plain, */*
Accept-Language: ru-RU,ru;q=0.9
Referer: https://market.proflowers.kz/exchange?page=1&sortOrder=ASC&sortBy=promotion
X-Requested-With: XMLHttpRequest
Sec-Fetch-Dest: empty
Sec-Fetch-Mode: cors
Sec-Fetch-Site: same-origin
```
Ответ (важные ключи верхнего уровня):
- `list[]` — товары (60 на страницу).
- `pages` = `{ total, pg, ipp }` — `total` это ОБЩЕЕ ЧИСЛО ТОВАРОВ, не страниц.
  Число страниц = `ceil(total / ipp)`. На 28.09.2026: total=2282, ipp=60 → 39 страниц.
- `catalogGroups`, `catalogGroupsFlat` (72 категории), `filterForm` — можно
  сохранить для будущей фильтрации, в MVP не обязательно.

Каталог категорий целиком (по желанию, для маппинга разделов):
`GET /catalog/groups` → JSON-дерево.

**Пагинация:** идём `page=1..ceil(total/ipp)`. Между запросами пауза **1000–1500 мс**
(аккаунт со спецценой терять из-за бана нельзя). User-Agent — обычный Chrome.

---

## 2. Структура одного товара (реальный объект из `list[]`)

```jsonc
{
  "id": 4809538,               // id ПРЕДЛОЖЕНИЯ на торговый день (uniq в рамках дня)
  "product_id": 392250,        // id самого ТОВАРА (постоянный)
  "name": "Букет искусственных веток \"Мимоза\", H40 см, 6 шт",
  "characteristics": "Сиреневый",
  "color_name": "Фиолетовый",
  "color": "rgb(179,143,238)",
  "country": { "name": "КИТАЙ", "id": 9728 },
  "trademark": "",
  "height": 40, "length": 0, "width": 0, "diameter": 0, "volume": 0,
  "flower_quantity": 0, "flower_weight": 0, "form": "", "collection_name": "",
  "barcode": "5500017736090",

  // ЦЕНЫ. price_with_discount / box_price_with_discount уже учитывают
  // персональную скидку аккаунта (personal_discount_percent) — ЭТО СПЕЦЦЕНА (закупка).
  "price": "930",                    // цена за штуку без перс. скидки
  "box_price": "930",                // цена за коробку без перс. скидки
  "price_with_discount": 930,        // ЗАКУПКА за штуку (берём это)
  "box_price_with_discount": 930,    // ЗАКУПКА за коробку
  "price_fixed": true,
  "personal_discount_percent": 0,
  "personal_discount_applied": false,
  "total_discount_percent": 0,
  "is_promotion": true,

  // ОСТАТКИ И КРАТНОСТИ
  "count_left": 64,                  // остаток
  "multiplicity": 1,                 // кратность продажи (шт)
  "box_multiplicity": 192,           // штук в коробке
  "count_in_package": 0,
  "is_sold_in_box": true,
  "is_box_only": false,
  "is_premium": false,

  // ПРИВЯЗКА К ДНЮ
  "trading_day": {
    "id": 8966, "type": "exchange",
    "date": "2026-09-28T00:00:00+05:00",
    "normalized_date": "2026-09-28T08:00:00+05:00",
    "name": "28.09.26", "nomenclature_name": "Товары декора", "nomenclature_id": 24
  },

  // МЕДИА
  "image_show": "https://marketimg.proflowers.kz/.../_card.jpg",
  "image_small": "https://marketimg.proflowers.kz/.../_small.jpg",
  "photos": ["https://marketimg.proflowers.kz/.../_card.jpg"],
  "nomenclature_icon": "https://marketimg.proflowers.kz/.../.png"
}
```

Замечания:
- `id` (offer) и `product_id` — РАЗНЫЕ. `product_id` стабилен между днями,
  `id` привязан к торговому дню. В БД разносим на две таблицы.
- Цены приходят и строкой, и числом — приводить к `numeric`.
- `count_left` может стать 0 / товар исчезнуть из выдачи — тогда пометить недоступным.

---

## 3. Схема БД (Supabase / Postgres)

Приведи к стилю проекта (SQL-миграция / Drizzle / Prisma). Логика фиксирована:
«сырьё от Proflowers» отдельно от «цены для клиента», между ними — правило наценки.
Все таблицы с префиксом `pf_`, отдельная схема или префикс — по стилю проекта.

**pf_trading_days**
- `id` bigserial PK
- `pf_id` bigint UNIQUE NOT NULL            — их trading_day.id
- `type` text NOT NULL                       — 'exchange' | 'preorder'
- `date` timestamptz
- `name` text
- `nomenclature_name` text
- `is_active` boolean DEFAULT true
- `synced_at` timestamptz DEFAULT now()

**pf_products** (карточка, редко меняется)
- `id` bigserial PK
- `pf_product_id` bigint UNIQUE NOT NULL      — их product_id
- `name` text NOT NULL
- `characteristics` text
- `color_name` text
- `country` text
- `trademark` text
- `height` numeric, `length` numeric, `diameter` numeric
- `barcode` text
- `image_url` text                            — image_show
- `photos` jsonb
- `updated_at` timestamptz DEFAULT now()

**pf_offers** (цена+остаток на конкретный день — «горячая» таблица)
- `id` bigserial PK
- `pf_offer_id` bigint UNIQUE NOT NULL         — их list[].id
- `product_id` bigint NOT NULL REFERENCES pf_products(pf_product_id)
- `trading_day_id` bigint NOT NULL REFERENCES pf_trading_days(pf_id)
- `purchase_price` numeric NOT NULL            — price_with_discount (закупка/шт)
- `box_purchase_price` numeric                 — box_price_with_discount
- `count_left` integer
- `multiplicity` integer
- `box_multiplicity` integer
- `is_sold_in_box` boolean
- `is_box_only` boolean
- `is_promotion` boolean
- `is_available` boolean DEFAULT true          — false, если пропал из выдачи
- `first_seen_at` timestamptz DEFAULT now()
- `last_seen_at` timestamptz DEFAULT now()
- индекс по (`trading_day_id`, `is_available`)

**pf_markup_rules** (наценка — отдельно от цен)
- `id` bigserial PK
- `scope` text DEFAULT 'global'                — на будущее: 'global' | 'category' | 'product'
- `scope_ref` text                             — id категории/товара для не-global
- `percent` numeric DEFAULT 0                  — наценка в %
- `plus_amount` numeric DEFAULT 0              — фикс. надбавка в тенге
- `is_active` boolean DEFAULT true
- `updated_at` timestamptz DEFAULT now()
- Заполнить одной строкой: scope='global', percent=0 (значение задаст владелец позже).

**pf_sync_runs** (журнал крона)
- `id` bigserial PK
- `started_at` timestamptz DEFAULT now()
- `finished_at` timestamptz
- `trading_day_id` bigint
- `trading_day_type` text
- `pages_fetched` integer
- `offers_upserted` integer
- `products_upserted` integer
- `marked_unavailable` integer
- `status` text                                — 'success' | 'error'
- `error` text

**Вьюха pf_catalog** — то, что показываем клиенту. Цена считается на лету:
```sql
create view pf_catalog as
select
  o.pf_offer_id,
  p.name, p.characteristics, p.color_name, p.country,
  p.image_url, p.photos,
  d.type            as trading_day_type,
  d.date            as trading_day_date,
  o.purchase_price,
  o.box_purchase_price,
  o.count_left, o.multiplicity, o.box_multiplicity,
  o.is_sold_in_box, o.is_box_only,
  -- клиентская цена = закупка + глобальная наценка
  round(
    o.purchase_price
    * (1 + coalesce((select percent from pf_markup_rules
                     where scope='global' and is_active limit 1),0)/100.0)
    + coalesce((select plus_amount from pf_markup_rules
                where scope='global' and is_active limit 1),0)
  ) as client_price
from pf_offers o
join pf_products p on p.pf_product_id = o.product_id
join pf_trading_days d on d.pf_id = o.trading_day_id
where o.is_available and coalesce(o.count_left,0) > 0;
```
Меняешь `percent` в pf_markup_rules — витрина пересчитывается сама.

RLS: таблицы `pf_*` пишет только сервис (service role) из крона. Для витрины —
читаем через вьюху `pf_catalog` (публичное чтение или через API-роут, по паттерну проекта).

---

## 4. Парсер + cron

Создай модуль (по структуре проекта, напр. `lib/proflowers/`):

- `client.ts` — логин (шаги из раздела 1), хранит cookie jar на время прогона.
  Используй нативный `fetch` с ручным cookie jar, либо `tough-cookie` +
  `fetch-cookie`, если он уже есть в проекте. Без внешних браузеров (никакого
  puppeteer — данные отдаёт JSON API).
- `parser.ts` — `syncTradingDay()`:
  1. `getActiveTradingDays()` → взять активные дни.
  2. Для каждого активного дня пройти страницы 1..ceil(total/ipp).
  3. Нормализовать каждый товар из `list[]` в объекты pf_products / pf_offers.
  4. **Upsert** pf_products по `pf_product_id`, pf_offers по `pf_offer_id`
     (обновлять `last_seen_at=now()`, `is_available=true`).
  5. После полного прохода дня: пометить `is_available=false` у офферов этого
     `trading_day_id`, чей `last_seen_at` старше начала прогона (пропали из выдачи).
  6. Записать строку в pf_sync_runs.
  - Пауза 1000–1500 мс между страницами. Ретрай (2–3 попытки) на 429/5xx с бэкоффом.
    Если ловим HTML вместо JSON — значит сессия слетела: перелогиниться один раз и продолжить.

- API-роут крона (по роутингу проекта), напр. `app/api/cron/pf-sync/route.ts`:
  - Защита секретом: проверять заголовок `Authorization: Bearer ${CRON_SECRET}`
    (Vercel Cron шлёт его) — чужой не должен дёрнуть.
  - Вызывает `syncTradingDay()`, возвращает JSON-итог (дни, страницы, upserts).
  - `maxDuration` под Vercel (прогон ~1–2 мин на 39 страниц).

- `vercel.json` → секция `crons`. «Несколько раз в день»: например каждые 3 часа
  в рабочее время. Пример: `{ "path": "/api/cron/pf-sync", "schedule": "0 6,9,12,15,18 * * *" }`
  (UTC; Уральск = UTC+5, подобрать под их часы приёма заказов).

Ручной запуск: сделай возможность дёрнуть тот же роут вручную (кнопкой из
админки или просто authorized-запросом) — владелец хотел «иногда обновлять руками».

---

## 5. Переменные окружения (добавить в проект и в Vercel)

```
PF_EMAIL=uralskflowers@gmail.com
PF_PASS=***               # пароль Proflowers; НЕ коммитить, только в env/Vercel
CRON_SECRET=***           # случайная строка для защиты cron-роута
# Supabase-ключи взять из уже существующих в проекте (service role для записи)
```
Пароль Proflowers засветился ранее в переписке — владельцу стоит его сменить и
положить новый только в переменные окружения.

---

## 6. Витрина «Под заказ / Биржа» (после того как парсер наполнит БД)

- Отдельный раздел сайта (роут напр. `/pod-zakaz` или `/birzha`), НЕ в общем
  каталоге и без связи с 1С.
- Источник — вьюха `pf_catalog` (или API-роут поверх неё).
- Карточка: фото (`image_url`), название, `characteristics`/`color_name`, страна,
  `client_price` (не показывать закупку!), остаток `count_left`, кратность
  (если `is_box_only` — продажа только коробками `box_multiplicity`).
- Плашка типа дня: «Биржа» (exchange) или «Предзаказ» (preorder) из `trading_day_type`,
  и дата поставки `trading_day_date`.
- Фильтры (v2): по категории из `catalogGroupsFlat`, по цвету из `filterForm`.
- Оформление заказа клиентом на этом этапе НЕ автоматизируем в сторону Proflowers —
  сначала витрина + сбор заявок (как принято в проекте: заявка → amoCRM/менеджер,
  инфраструктура WhatsApp/Telegram у владельца уже есть). Уточнить у владельца
  перед реализацией корзины.

---

## Порядок реализации
1. Изучить проект (раздел 0).
2. Миграция БД (раздел 3) + строка pf_markup_rules(global, 0%).
3. `lib/proflowers/client.ts` + `parser.ts` (раздел 4), локальный прогон одного дня.
4. Cron-роут + vercel.json (раздел 4), проверка на Vercel.
5. Витрина (раздел 6) — отдельной задачей после наполнения БД.

После шага 3 покажи владельцу первые строки pf_offers/pf_products, чтобы сверить
маппинг полей до деплоя крона.

# PROFLOWERS_SYNC.md — синк каталога Proflowers

**Обновлено:** 22.09.2026
**Статус:** код на проде, `/etc/cron.d/` ещё не настроен (шаг 4 в процессе)

---

## Суть

Отдельная витрина «Под заказ / Биржа» будущего раздела сайта: товары поставщика
**market.proflowers.kz** (JSON API, аккаунт «ТОО Цветы Уральска» со спеццене).
Изолировано от основного каталога `products` и синхронизации с 1С — свои
таблицы `pf_*`, внешних ключей на `products` нет.

- Код: `src/lib/proflowers/` (`types.ts`, `client.ts`, `parser.ts`)
- Роут: `src/app/api/cron/pf-sync/route.ts`
- Миграция: `supabase/migrations/20260921120000_proflowers_pf_tables.sql`
- ТЗ разведки API: `TZ-proflowers-integration.md` (корень репозитория, ветка `proflowers-integration`)

## Как это работает

1. `client.ts` — логин на market.proflowers.kz (email/пароль → cookie-сессия),
   cookie-jar на время прогона, пауза 1–1.5 с между запросами, ретраи на
   429/5xx, до 3 перелогинов за прогон при слетевшей сессии.
2. `parser.ts` → `syncTradingDay()` — один сквозной обход каталога
   (`/catalog/products`, страницы `1..ceil(total/ipp)`) покрывает все активные
   торговые дни разом: день вложен в каждый товар (`list[].trading_day`), а
   сам эндпоинт параметра дня не принимает. Порядок записи на каждой странице:
   `pf_trading_days` → `pf_products` → `pf_offers` (у оффера FK на оба). Upsert
   идемпотентен (`pf_id`/`pf_product_id`/`pf_offer_id`) — повторный прогон не
   плодит дубли. Офферы, пропавшие из выдачи, гасятся (`is_available=false`)
   только в пределах дня, реально обработанного в этом прогоне.
3. `pf_sync_runs` — журнал: строка `status='running'` пишется в начале
   прогона, обновляется на `success`/`error` в конце. `running` старше 15 мин
   (`RUN_STALE_AFTER_MS`) считается протухшей — не блокирует новый прогон.
4. `pf_catalog` (вьюха) — то, что можно показывать клиенту: закупочной цены
   (`purchase_price`) там нет, только `client_price = закупка × (1 + наценка%) + доплата`
   из `pf_markup_rules` (сейчас 0%, значение задаёт владелец).

## Переменные окружения

| Переменная | Значение |
|---|---|
| `PF_EMAIL` | логин аккаунта на market.proflowers.kz |
| `PF_PASS` | пароль (сменить, если засветился в переписке; только в `.env.production` на VPS, в код/репозиторий/фикстуры не попадает) |
| `CRON_SECRET` | уже есть в проекте, переиспользуется (как в `/api/cron/cleanup`) |

## Cron-роут

`GET /api/cron/pf-sync`, защита `Authorization: Bearer $CRON_SECRET` (401 без
неё). Перед прогоном проверяет `pf_sync_runs` на незавершённый `running` —
если занято, отвечает `409` и не запускает `syncTradingDay()` второй раз.
Ответ: `200` с JSON-итогом прогона (страницы, upsert-счётчики, дни) или `500`
с текстом ошибки — в обоих случаях с накопленным логом прогона.

**Прод — VPS, не Vercel.** Расписание НЕ через `vercel.json` → `crons`
(эта секция на проде не выполняется, см. `docs/INFRA.md`), а через
`/etc/cron.d/` на сервере, как остальные cron'ы проекта (`flowers-cleanup`,
`flowers-widget-amo-sync`). Запрос — **строго на `http://127.0.0.1:3000`**,
мимо nginx: прогон занимает ~1.5–2 мин (38–39 страниц каталога), а
nginx-прокси обрубает соединение на 60-й секунде. `curl --max-time 300` —
запас на ретраи/перелогин внутри прогона.

Расписание — временное, консервативное, до появления данных о том, когда
Proflowers реально обновляет каталог/открывает торговые дни: **каждые 3 часа
в рабочее время Уральска 8:00–20:00 (UTC+5)** → в UTC `3,6,9,12,15`, 5
прогонов в день. Через ~неделю сузить по факту — смотреть
`pf_sync_runs.started_at` (когда реально появляются новые офферы/меняются
цены) и `pf_trading_days.synced_at`.

Кроны на этом VPS работают от `root` (не `deploy`) — root читает
`.env.production` (chmod 600, владелец `deploy`) в обход прав файла как
суперпользователь. Логирование — перенаправлением прямо в строке `cron.d`
(`>> log 2>&1`), как у `flowers-widget-amo-sync`; сам скрипт короткий и
ничего не пишет в файл самостоятельно.

### Пример `/etc/cron.d/flowers-pf-sync` (шаблон, реальный файл только на VPS)

```cron
# Синк каталога Proflowers (market.proflowers.kz) -> pf_* в Supabase.
# Расписание временное/консервативное — см. docs/PROFLOWERS_SYNC.md.
0 3,6,9,12,15 * * * root /usr/local/bin/flowers-pf-sync.sh >> /srv/flowers-b2b/logs/cron-pf-sync.log 2>&1
```

### Пример `/usr/local/bin/flowers-pf-sync.sh` (шаблон, реальный файл только на VPS)

```bash
#!/bin/bash
# Синк каталога Proflowers. Бьёт в 127.0.0.1:3000 НАПРЯМУЮ, мимо nginx — прогон
# занимает ~1.5-2 мин, а nginx-прокси обрубает соединение на 60-й секунде.
set -uo pipefail

ENV_FILE="/srv/flowers-b2b/shared/.env.production"
CRON_SECRET="$(grep -E '^CRON_SECRET=' "$ENV_FILE" | head -1 | cut -d '=' -f2-)"

if [ -z "$CRON_SECRET" ]; then
  echo "ERROR: CRON_SECRET пуст или не найден в $ENV_FILE"
  exit 1
fi

curl -sS --max-time 300 -w '\nHTTP %{http_code}\n' \
  -H "Authorization: Bearer $CRON_SECRET" \
  http://127.0.0.1:3000/api/cron/pf-sync
```

### Кроны подкатегорий — `flowers-pf-sync-groups` / `flowers-pf-sync-product-groups`

Ещё НЕ заведены на VPS (28.09.2026) — шаблоны ниже, по образцу `flowers-pf-sync.sh`
выше. Два отдельных крона (дерево — дёшево, обход листьев — дорого,
~2-3 мин), второй стартует на 5 мин позже первого: `pf-sync-product-groups`
читает листья ИЗ уже наполненного `pf_catalog_groups`, дерево должно
успеть собраться раньше.

```cron
# /etc/cron.d/flowers-pf-sync-groups
0 2 * * * root /usr/local/bin/flowers-pf-sync-groups.sh >> /srv/flowers-b2b/logs/cron-pf-sync-groups.log 2>&1

# /etc/cron.d/flowers-pf-sync-product-groups
5 2 * * * root /usr/local/bin/flowers-pf-sync-product-groups.sh >> /srv/flowers-b2b/logs/cron-pf-sync-product-groups.log 2>&1
```

```bash
# /usr/local/bin/flowers-pf-sync-groups.sh
#!/bin/bash
set -uo pipefail
ENV_FILE="/srv/flowers-b2b/shared/.env.production"
CRON_SECRET="$(grep -E '^CRON_SECRET=' "$ENV_FILE" | head -1 | cut -d '=' -f2-)"
if [ -z "$CRON_SECRET" ]; then echo "ERROR: CRON_SECRET пуст или не найден в $ENV_FILE"; exit 1; fi
curl -sS --max-time 60 -w '\nHTTP %{http_code}\n' \
  -H "Authorization: Bearer $CRON_SECRET" \
  http://127.0.0.1:3000/api/cron/pf-sync-groups
```

```bash
# /usr/local/bin/flowers-pf-sync-product-groups.sh
#!/bin/bash
set -uo pipefail
ENV_FILE="/srv/flowers-b2b/shared/.env.production"
CRON_SECRET="$(grep -E '^CRON_SECRET=' "$ENV_FILE" | head -1 | cut -d '=' -f2-)"
if [ -z "$CRON_SECRET" ]; then echo "ERROR: CRON_SECRET пуст или не найден в $ENV_FILE"; exit 1; fi
curl -sS --max-time 300 -w '\nHTTP %{http_code}\n' \
  -H "Authorization: Bearer $CRON_SECRET" \
  http://127.0.0.1:3000/api/cron/pf-sync-product-groups
```

## Заявки с витрины «Под заказ» (`pf_orders`/`pf_order_items`)

Оформление на `/pod-zakaz` — модель «заявка менеджеру», не оплата и не автозаказ в
Proflowers. Роут `POST /api/pod-zakaz/order`, миграция
`supabase/migrations/20260924080000_pf_orders_tables.sql`. Цена/остаток/кратность
(короб vs шт) пересчитываются на сервере из `pf_catalog` той же логикой `maxSteps()`/
`stepPrice()` из `src/lib/pod-zakaz/format.ts`, что использует степпер на карточке —
клиенту не доверяем ни цену, ни расчёт коробок.

**Известные хвосты (24.09.2026, не баги):**
- `manager_notified` у новых заявок остаётся `false` — `umnicoClient.checkContact()`
  возвращает `400` с пустым телом для ЛЮБОГО номера (проверено и на `UMNICO_MANAGER_PHONE`,
  и на дефолтном складском `77780079630`), при этом с валидным токеном но некорректным
  запросом API отвечает нормальным `422`+текстом — значит токен принят, но конкретно
  `saId=105641` (`UMNICO_WHATSAPP_SA_ID`) не может достучаться до WhatsApp: сессия
  отвалилась на стороне Umnico. Чинится переподключением WhatsApp-сессии в кабинете
  Umnico (владелец), не правкой кода — и чинит уведомления не только здесь, а во всём
  проекте (checkout PIN, `notifyOrderChain` менеджеру/складу).
- Коробочная кратность (`is_box_only`) в `/api/pod-zakaz/order` не протестирована вживую —
  на момент проверки в `pf_catalog` не было ни одной позиции с `is_box_only=true` и
  остатком `>0`. Логика общая с рабочим степпером карточки, но отдельного факта нет —
  перепроверить curl-тестом, как появится коробочный товар в наличии.

## Подкатегории (`pf_catalog_groups`/`pf_product_groups`)

Proflowers не даёт товару поле-привязку к подкатегории (`group_id` и т.п. — проверено по
сырым ключам `list[].item`, разведка 24.09.2026). Связь узнаём косвенно: `GET
/catalog/products?trading_days[]=<день>&group_ids[]=<лист>` реально сужает выдачу до товаров
этого листа (подтверждено — 58 листьев декора = ровно `pages.total` дня, без пересечений; на
25.09.2026 перепроверено на полном проде через все 73 листа обеих номенклатур — 2523 связи =
2523 товара, пересечений 0). Несколько `group_ids[]` в одном запросе сливают товары без метки
группы — на каждый **лист** (`has_children=false`) нужен отдельный GET.

- `src/lib/proflowers/groups.ts` → `syncCatalogGroups()` — дёшево (1 запрос `ipp=1` на
  номенклатуру активного дня), наполняет дерево `pf_catalog_groups` (`parent_pf_group_id` из
  вложенности `__children`). Роут `/api/cron/pf-sync-groups`.
- `src/lib/proflowers/product-groups.ts` → `syncProductGroups()` — дорого (один GET на каждый
  лист + доп. страницы, ~90+ запросов на прогон), пишет `pf_product_groups` (`product_id`,
  `pf_group_id`, составной ключ — НЕ единственный PK на `product_id`, товар теоретически может
  быть в нескольких листьях). Атомарность НА ЛИСТ: страницы листа собираются полностью в
  памяти, upsert + удаление устаревших связей (`synced_at < run_started_at`, только для ЭТОГО
  листа) выполняются одним блоком ПОСЛЕ успешного сбора; при любой ошибке внутри листа —
  ничего не пишется и не удаляется, старые связи остаются, следующий прогон повторит попытку.
  Роут `/api/cron/pf-sync-product-groups`. **НЕ вешать на основной 3-часовой `/api/cron/pf-sync`**
  — отдельный редкий крон.

**Источник дней для обоих обходов — `client.getActiveTradingDays()` (`/trading-days/`), не
`stop_time` из нашей БД.** Разбирался в этом специально (25.09.2026): у витрины (`pf_catalog`)
свой, более широкий критерий видимости — `stop_time is null or stop_time > now()` — товар
показывается ещё какое-то время ПОСЛЕ того, как день пропал из `activeTradingDays`
(`is_active` в `pf_trading_days` это и отражает, но не гейтит витрину). Проверил напрямую:
запрос `trading_days[]=<день, уже не в activeTradingDays>` к Proflowers отдаёт `{"status":
false}` — поставщик в принципе не обслуживает `group_ids[]`-фильтр для закрытого им дня,
независимо от того, что показывает наша витрина. Значит переключать источник дней на `stop_time`
из БД **бессмысленно** — Proflowers всё равно откажет. Единственный работающий источник —
`activeTradingDays` на момент прогона.

**Практическое следствие:** окно, в которое лист-товар может получить `group_id`, — ровно
время, пока его день числится в `activeTradingDays` у Proflowers. Если крон не попал в это
окно (день открылся и закрылся между двумя запусками) — товар остаётся с `group_id=null` до
конца жизни ТОГО дня; закрывает пробел не код, а частота крона. На 25.09.2026 так вышло с
номенклатурой 28 «Комнатные растения» (день 8969, `is_active=false`, но `stop_time` в
будущем — 317 из 332 `null` в `pf_catalog` именно отсюда). Расписание группового крона пока не
заведено на VPS (шаг сделан вручную) — когда будем заводить, стоит начать почаще (2–3 раза в
сутки, не 1), а через неделю сузить по факту наблюдений за `pf_trading_days.start_time`/
`stop_time` (тот же подход, что и для расписания основного `pf-sync`).

## Известные ограничения

- Проверка занятости (`getRunningSyncRun`) и последующая запись новой
  `running`-строки не атомарны на уровне БД — теоретическая гонка при двух
  одновременных запусках. Риск принят как мизерный (cron раз в 3 часа, ручной
  запуск редкий); частичный уникальный индекс на
  `pf_sync_runs(status) where status='running'` не заводили.
- `pf_sync_runs.trading_day_id`/`trading_day_type` — одиночные колонки. Если
  одновременно активны два торговых дня (exchange + preorder), в БД пишется
  `null` в обе — сводка по дням есть только в JSON-ответе роута, не в БД.
- Коробочная цена (`client_price` для `is_box_only`) на витрине `pf_catalog`
  пока не считается отдельно — см. раздел 6 `TZ-proflowers-integration.md`,
  отложено до реализации самой витрины.

## Первый прогон (22.09.2026, ручной, без cron)

38 страниц, `products_upserted=2279`, `offers_upserted=2279`,
`skippedInvalidOffers=0`, день `8966:exchange`, 104.6 с. Маппинг сверен
построчно с живой БД перед включением крона.

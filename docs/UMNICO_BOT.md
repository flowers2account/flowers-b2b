# ИИ-бот поддержки в Umnico (расходка) — v1

Бот автоматически отвечает клиентам в чатах Umnico на вопросы **по расходным
материалам** (`products.category='accessories'`): горшки, удобрения, плёнка, ленты,
упаковка, коробки, средства защиты и т.п. Опирается на живые данные Supabase.
Использует уже подключённый Gemini (`models/gemini-flash-lite-latest`).

> v1 = **только расходка.** Вопросы про цветы, заказ, доставку, оплату, скидки и
> жалобы бот не трогает — диалог остаётся менеджеру.

## Файлы

| Файл | Назначение |
|------|-----------|
| `src/app/api/webhooks/umnico/route.ts` | Приёмник вебхука (POST). Kill-switch, канальная политика, команды, дедуп, всегда 200 |
| `src/lib/umnico.ts` | Клиент Umnico API: `getSources`, `sendMessage`, `addTag` |
| `src/lib/gemini.ts` | Общий клиент Gemini (тот же вызов, что в `/api/translations/batch`) |
| `src/lib/bot/accessories-bot.ts` | Логика бота: классификация → поиск → ответ. **Системный промпт, small talk, site-help и канальная политика правятся здесь** |
| `src/lib/bot/site-faq.ts` | Памятка клиента (`CLIENT_FAQ`) — единый источник для бота (intent=site_help) и `docs/CLIENT_FAQ.md` |
| `src/lib/bot/lead-gate.ts` | Гейт диалогов для режима `manual` (таблица `bot_enabled_leads`) |

## Трёхуровневое управление

Чтобы бот ответил, должны совпасть **все три** уровня:

### 1) Env-рубильник `UMNICO_BOT_ENABLED` (общий вкл/выкл)

- Бот работает **только** если `UMNICO_BOT_ENABLED=true` на Vercel. По умолчанию (нет переменной) — молчит во всех каналах, вебхук сразу отдаёт `200`.
- Аварийная остановка: убрать переменную (или поставить ≠ `true`) и сделать redeploy. Ещё быстрее — снять регистрацию вебхука в Umnico (`scripts/unregister-umnico-webhook.ts`).

### 2) Карта каналов `CHANNEL_POLICY` (в `accessories-bot.ts`)

Канал берётся из `body.message.sa.type`. Режим на канал:

| Режим | Поведение |
|-------|-----------|
| `auto` | бот отвечает сам (полный конвейер) |
| `manual` | отвечает **только** в диалогах, включённых командой `/бот` |
| `off` | полное молчание, лог `skip: channel off` |

```ts
export const CHANNEL_POLICY: Record<string, ChannelMode> = {
  widget: 'auto',
  whatsapp2: 'off',
}
```

Канал, которого нет в карте, трактуется как `off`. Текущее состояние: **виджет сайта — авто, WhatsApp — выкл.**

### 3) Команды менеджера на диалог (для `manual`-каналов)

В `message.outgoing` (сообщение менеджера) распознаются команды:

| Команда | Действие |
|---------|----------|
| `/бот` | включить бота в этом диалоге + короткое подтверждение в чат |
| `/стоп` | выключить бота в этом диалоге, молча |

- Хранилище — таблица `bot_enabled_leads` (см. миграцию ниже).
- Сообщения **самого бота** (`userId === UMNICO_BOT_USER_ID`) игнорируются всегда — анти-петля.
- `message.outgoing` без команды — скип.
- В `auto`-каналах гейт не проверяется; в `off` — сообщения вообще не доходят до конвейера.

## Поток обработки (на каждый вебхук)

1. `UMNICO_BOT_ENABLED ≠ true` → `200`, ничего не делаем.
2. Лог сырого payload (`raw:`) и распарсенных полей.
3. `message.outgoing` → ветка команд (`/бот` / `/стоп`), иначе скип. `200`.
4. Только `message.incoming` идёт дальше. Нет `leadId`/`text` → скип.
5. Канальная политика (`off` / `manual`-гейт / `auto`).
6. Дедуп по `messageId` (in-memory Set).
6a. **Контекст диалога**: `fetchDialogContext(leadId, realId)` — последние ~10 сообщений
   истории (`POST /messaging/{leadId}/history/{realId}`), роли `client`/`bot`/`manager`,
   текущее сообщение исключается. Ошибка → продолжаем без контекста. Контекст передаётся
   в классификатор (наследование темы по коротким репликам) и в compose (не здороваться
   повторно, отвечать как продолжение). Повторное приветствие, если бот уже писал →
   короткий `SMALLTALK_REPLIES_REPEAT`.
7. **Классификация** (Gemini, JSON): `{ intent: 'smalltalk' | 'accessories' | 'site_help' | 'other', keywords }`.
   - `smalltalk` → готовый шаблон из `SMALLTALK_REPLIES` (без Supabase/Gemini).
   - `site_help` (регистрация / вход / PIN / заказ / доставка / оплата / график / контакты)
     → ответ по памятке `CLIENT_FAQ` (без Supabase). Чего в памятке нет / вопрос про
     конкретный заказ клиента → `NO_ANSWER`, менеджеру.
   - `other` → молчание, диалог менеджеру.
   - `accessories` → поиск + ответ.
8. **Поиск** (Supabase): `keywords` ILIKE по `name`/`display_name`:
   ```sql
   select id, display_name, subcategory, price, unit, qty, pack_size
   from products
   where category='accessories' and is_active=true and price>0 and hidden_for_demo=false
     and (name ilike '%kw%' or display_name ilike '%kw%' ...)
   limit 20;
   ```
9. **Ответ** (Gemini): сообщение + строки (с готовыми `url`/`catalog_url`) + системный
   промпт → короткий ответ **или** ровно `NO_ANSWER`.
10. Ответ ≠ `NO_ANSWER` → отправка в Umnico (source из вебхука, fallback `getSources`)
    + тег `отвечено-ботом`. Иначе — ничего.

### Ссылки в ответах

В контекст каждого товара кладутся готовые ссылки, бот их только цитирует (не конструирует):
- `url` = `https://uralskflowers.kz/product/{id}` — карточка товара;
- `catalog_url` = `https://uralskflowers.kz/catalog?category=accessories&leaves={subcategory}` —
  подборка по подкатегории. Каталог читает эти параметры в `CatalogLayout.tsx`
  (`category` / `group` / `leaves` / `search`).

### Гардрейлы

- Никогда не обещает резерв / заказ / доставку.
- Не отвечает на исходящие сообщения (петля исключена; свои сообщения отбрасываются по `userId`).
- Дедуп повторных `messageId`.
- Любая ошибка → всё равно `200` (Umnico не ретраит).

## ENV (на Vercel)

| Переменная | Описание |
|-----------|---------|
| `UMNICO_BOT_ENABLED` | Общий рубильник. `true` — бот активен, иначе молчит |
| `UMNICO_API_TOKEN` | JWT из Umnico: **Настройки → API** |
| `UMNICO_BOT_USER_ID` | id сотрудника-бота (см. разовую настройку) |

Уже есть: `GOOGLE_GEMINI_API_KEY`, `NEXT_PUBLIC_GEMINI_MODEL`, `SUPABASE_SERVICE_ROLE_KEY`.

## Миграция

`supabase/migrations/20260610_bot_enabled_leads.sql` — таблица `bot_enabled_leads`
(`lead_id bigint PK`, `enabled_at`, `enabled_by`). **Применить до включения любого
`manual`-канала.** Пока в `CHANNEL_POLICY` нет `manual`, таблица не используется и её
отсутствие безопасно (гейт логирует ошибку и отдаёт «выключено»).

## Разовая настройка (после деплоя)

1. **Создать сотрудника «Бот»** в Umnico, узнать его `userId` и положить в `UMNICO_BOT_USER_ID`:
   ```bash
   node --env-file=.env.local scripts/list-umnico-managers.ts
   ```
2. **Зарегистрировать вебхук** (URL — аргументом, либо из `WEBHOOK_URL` / `NEXT_PUBLIC_SITE_URL`):
   ```bash
   node --env-file=.env.local scripts/register-umnico-webhook.ts https://<домен>/api/webhooks/umnico
   ```
3. **Включить бота:** на Vercel задать `UMNICO_BOT_ENABLED=true`, redeploy.
4. **Проверить:** написать в чат виджета «есть удобрение для роз и почём» → бот отвечает
   названием, ценой в тенге, наличием и ссылкой на карточку.

## Скрипты

| Скрипт | Назначение | Запуск |
|--------|-----------|--------|
| `scripts/list-umnico-managers.ts` | `GET /v1.3/managers` → таблица `id / name / login` (найти userId бота) | `node --env-file=.env.local scripts/list-umnico-managers.ts` |
| `scripts/register-umnico-webhook.ts` | `POST /v1.3/webhooks` → регистрация вебхука, печатает id | `node --env-file=.env.local scripts/register-umnico-webhook.ts <url>` |
| `scripts/unregister-umnico-webhook.ts` | `GET /v1.3/webhooks` (список) или `DELETE /v1.3/webhooks/<id>` (удаление) | `node --env-file=.env.local scripts/unregister-umnico-webhook.ts [id]` |
| `scripts/gen-client-faq.ts` | Генерирует `docs/CLIENT_FAQ.md` из `src/lib/bot/site-faq.ts` | `node scripts/gen-client-faq.ts` |
| `scripts/export-umnico-history.ts` | Выгрузка переписки за период в `exports/*.jsonl` (анализ). `--days N` / `--from --to`, `--sample N` | `node --env-file=.env.local scripts/export-umnico-history.ts --days 30` |

> Node 24 исполняет `.ts` напрямую (стрип типов). Папка `scripts/` исключена из
> tsconfig (не участвует в сборке Next). Скрипты падают с понятной ошибкой, если
> `UMNICO_API_TOKEN` не задан.

## Правка поведения

- **Общий вкл/выкл** — env `UMNICO_BOT_ENABLED` на Vercel.
- **Какие каналы и как** — `CHANNEL_POLICY` в `src/lib/bot/accessories-bot.ts`.
- **Включить бота в конкретном диалоге** (manual-канал) — команда `/бот` в чате; `/стоп` — выключить.
- **Тон/правила ответа по товарам** — `SYSTEM_PROMPT` в `accessories-bot.ts`.
- **Ответы на приветствие/спасибо/прощание** — `SMALLTALK_REPLIES` там же.
- **Ответы про сайт (FAQ)** — текст в `src/lib/bot/site-faq.ts` (`CLIENT_FAQ`); правила — `SITE_HELP_PROMPT` в `accessories-bot.ts`. После правки `site-faq.ts` обновить md: `node scripts/gen-client-faq.ts`.
- **Что считать расходкой / сайтом / ключевые слова** — промпт `classifyMessage` там же.

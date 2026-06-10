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
| `src/app/api/webhooks/umnico/route.ts` | Приёмник вебхука (POST). Фильтрует, дедупит, всегда отвечает 200 |
| `src/lib/umnico.ts` | Клиент Umnico API: `getSources`, `sendMessage`, `addTag` |
| `src/lib/bot/accessories-bot.ts` | Логика бота: классификация → поиск → ответ. **Системный промпт правится здесь** |

## Поток обработки (на каждый вебхук)

1. Обрабатывается **только** `type === 'message.incoming'`. Всё остальное
   (особенно `message.outgoing`) игнорируется — защита от петли. Сразу `200`.
2. Дедуп по `messageId` (in-memory Set) — повторные доставки игнорируются.
3. **Шаг A** (Gemini, JSON): `{ in_scope: boolean, keywords: string[] }`.
   `in_scope=false` (цветы / заказ / доставка / оплата / скидки / жалоба) → выход, ничего не шлём.
4. **Шаг B** (Supabase): поиск по `keywords` ILIKE по `name`/`display_name`:
   ```sql
   select id, display_name, subcategory, price, unit, qty, pack_size
   from products
   where category='accessories' and is_active=true and price>0 and hidden_for_demo=false
     and (name ilike '%kw%' or display_name ilike '%kw%' ...)
   limit 20;
   ```
5. **Шаг C** (Gemini): сообщение клиента + найденные строки + системный промпт →
   короткий ответ **или** ровно `NO_ANSWER`.
6. Если ответ ≠ `NO_ANSWER` → отправка в Umnico (`getSources` → source `type='message'`
   → `send`) + тег `отвечено-ботом`. Иначе — ничего не шлём.

### Гардрейлы

- Никогда не обещает резерв / заказ / доставку.
- Не отвечает на исходящие сообщения (петля исключена).
- Дедуп повторных `messageId`.
- Любая ошибка → всё равно `200` (Umnico не ретраит).

## ENV (добавить в Vercel)

| Переменная | Описание |
|-----------|---------|
| `UMNICO_API_TOKEN` | JWT из Umnico: **Настройки → API** |
| `UMNICO_BOT_USER_ID` | id сотрудника-бота (см. разовую настройку) |

Уже есть: `GOOGLE_GEMINI_API_KEY`, `NEXT_PUBLIC_GEMINI_MODEL`, `SUPABASE_SERVICE_ROLE_KEY`.

## Разовая настройка (после деплоя)

1. **Создать сотрудника «Бот»** в Umnico, затем узнать его `userId` скриптом и положить в `UMNICO_BOT_USER_ID`:
   ```bash
   node --env-file=.env.local scripts/list-umnico-managers.ts
   ```
   Печатает таблицу `id / name / login` всех сотрудников.
2. **Зарегистрировать вебхук** скриптом (URL — аргументом, либо из `WEBHOOK_URL` / `NEXT_PUBLIC_SITE_URL`):
   ```bash
   node --env-file=.env.local scripts/register-umnico-webhook.ts https://<домен>/api/webhooks/umnico
   ```
   Печатает HTTP-статус и `webhook id`. Альтернатива — curl:
   ```bash
   curl -X POST https://api.umnico.com/v1.3/webhooks \
     -H "Authorization: bearer $UMNICO_API_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"url":"https://<домен>/api/webhooks/umnico","name":"AI bot"}'
   ```
3. **Проверить:** написать в чат «есть удобрение для роз и почём» → бот должен ответить
   названием, ценой в тенге и наличием.

## Скрипты

| Скрипт | Назначение | Запуск |
|--------|-----------|--------|
| `scripts/list-umnico-managers.ts` | `GET /v1.3/managers` → таблица `id / name / login` (найти userId бота) | `node --env-file=.env.local scripts/list-umnico-managers.ts` |
| `scripts/register-umnico-webhook.ts` | `POST /v1.3/webhooks` → регистрация вебхука, печатает id | `node --env-file=.env.local scripts/register-umnico-webhook.ts <url>` |

> Node 24 исполняет `.ts` напрямую (стрип типов). Оба скрипта падают с понятной
> ошибкой, если `UMNICO_API_TOKEN` не задан.

## Правка поведения

- **Тон/правила ответа** — `SYSTEM_PROMPT` в `src/lib/bot/accessories-bot.ts`.
- **Что считать расходкой / ключевые слова** — промпт `classifyMessage` там же.

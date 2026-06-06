# PAYMENTS.md — Онлайн-оплата (epay / Halyk Bank)

> Актуально на: 06.06.2026
> Источник истины: `src/app/api/payments/*`, `src/hooks/useOrderCheckout.ts`, `docs/payments-migration.sql`, `.env.production` на VPS.
> Статус: **тестовый контур работает**. Ждём боевые ключи банка и DNS (postlink требует публичный HTTPS).

Эквайринг — epay от АО «Народный Банк Казахстана» (Halyk Bank), виджет `payment-api.js` (`window.halyk.showPaymentWidget`).

---

## 1. Схема потока

```
Клиент жмёт «Оформить»
  │
  ▼
POST /api/checkout                 → создаёт order (pending, payment_status=unpaid) + резерв 30 мин
  │  возвращает order_id           ⚠️ уведомления НЕ шлёт
  ▼
POST /api/payments/init            → OAuth-токен epay + INSERT payments(status=created) + конфиг виджета
  │  возвращает widgetConfig
  ▼
window.halyk.showPaymentWidget()   → клиент вводит карту в виджете Halyk
  │  (скрипт NEXT_PUBLIC_EPAY_JS_URL загружается один раз за сессию)
  ▼
GET /api/payments/status?invoice=  → поллинг каждые 2с, до 120с, ждём терминальный статус
  │
  ▼
POST /api/payments/postlink        ← банк зовёт сервер-в-сервер (ИСТОЧНИК ИСТИНЫ)
       success: payments=success, orders.payment_status=paid,
                заказ становится виден в админке, шлёт Telegram + WhatsApp (менеджеру и клиенту)
       fail:    payments=failed, reason
```

Ключевая идея: **деньги подтверждает только postlink** (server-to-server), не клиент. Поллинг статуса нужен лишь для UX (показать результат). Уведомления и видимость заказа в админ-канбане — строго после `payment_status=paid`.

---

## 2. Эндпоинты

| Роут | Метод | Описание |
|------|-------|----------|
| `/api/payments/init` | POST | `{ orderId }` → OAuth-токен, создаёт запись `payments`, возвращает конфиг виджета (auth, invoiceId, amount, terminal, backLink, postLink…) |
| `/api/payments/status` | GET | `?invoice=` → `{ status, orderId, cardMask, amount }` (для поллинга) |
| `/api/payments/postlink` | POST | Публичный callback банка. Идемпотентен. Проверяет amount/terminal/secret_hash. На success — обновляет заказ и шлёт уведомления. Всегда отвечает 200. |

Все три — `force-dynamic`, используют `createAdminClient()` (service role).

### init — детали
- Проверяет, что заказ оплачиваем: `status ∈ {pending, reserved, confirmed}` И `payment_status='unpaid'`.
- `accountId` для виджета = телефон клиента (из `clients.phone`) или `guest_phone`.
- `invoiceId` ← RPC `get_next_invoice_id()` (sequence), фоллбэк `Date.now().slice(-12)`.
- `secret_hash` = `randomBytes(12).toString('hex')` (24 hex), сохраняется в `payments`, сверяется в postlink.
- `amount` = `Math.round(order.total)` — целые тенге, currency `KZT`.
- OAuth: POST на `EPAY_OAUTH_URL`, `grant_type=client_credentials`, scope включает `payment`, передаёт `invoiceID/amount/currency/terminal`.
- `backLink`/`failureBackLink`/`postLink`/`failurePostLink` строятся от `origin` запроса.

### postlink — детали
- Находит `payments` по `invoice_id`.
- Идемпотентность: если уже `success` → сразу `{ ok: true, idempotent: true }`.
- Проверки: `amount` совпадает, `terminal` = `EPAY_TERMINAL_ID`, `secret_hash` совпадает (если присутствуют в теле).
- Успех: `code/status ∈ {ok, success, 0}`. Тянет `card_mask`, `epay_payment_id`, `reference` из вложенного `payment`/`data`.
- На success: `payments.status=success`, `orders.payment_status=paid`, `payment_method='epay'`, `payment_comment='Карта ****'`; затем Telegram + WhatsApp (менеджеру через `umnicoTemplates.newOrderToManager`, клиенту через `orderPaidToClient`).
- На fail: `payments.status=failed`, `reason`.
- Любая внутренняя ошибка → всё равно 200 (по требованию epay), залогирована.

---

## 3. Схема БД (`docs/payments-migration.sql`)

```sql
CREATE SEQUENCE payments_invoice_seq START 100001;

CREATE TABLE payments (
  id              uuid PK default gen_random_uuid(),
  order_id        int  REFERENCES orders(id),
  invoice_id      text UNIQUE NOT NULL,   -- только цифры, 6-15 знаков
  amount          numeric NOT NULL,
  currency        text default 'KZT',
  status          text default 'created'  -- created|processing|success|failed
                  CHECK (status IN ('created','processing','success','failed')),
  secret_hash     text NOT NULL,
  epay_payment_id text,
  card_mask       text,
  reference       text,
  reason          text,
  raw_postlink    jsonb,                  -- полное тело callback для разбора
  created_at      timestamptz default now(),
  paid_at         timestamptz
);

-- в orders:
ALTER TABLE orders
  ADD COLUMN payment_status text default 'unpaid'  -- unpaid|paid|refunded
    CHECK (payment_status IN ('unpaid','paid','refunded')),
  ADD COLUMN paid_at timestamptz;
```

Также `orders` использует `payment_method` ('epay') и `payment_comment` (маска карты) — поля уже существовали.

RPC `get_next_invoice_id()` — SECURITY DEFINER, отдаёт `nextval('payments_invoice_seq')`.

> ⚠️ `invoice_id` строго **6–15 цифр**. Префикс `INV-` запрещён банком (раньше падало — коммит `be2d4cd`). Поэтому используется числовой sequence (start 100001), а не строковые номера.

---

## 4. Переменные окружения

| Переменная | Тип | Назначение |
|-----------|-----|-----------|
| `EPAY_CLIENT_ID` | server | client_id для OAuth |
| `EPAY_CLIENT_SECRET` | server | client_secret для OAuth |
| `EPAY_TERMINAL_ID` | server | ID терминала, сверяется в postlink |
| `EPAY_OAUTH_URL` | server | endpoint OAuth-токена |
| `NEXT_PUBLIC_EPAY_JS_URL` | **build-time** | URL скрипта виджета (вшивается в бандл) |
| `NEXT_PUBLIC_PAYMENTS_MODE` | **build-time** | `test` / `live` (вшивается в бандл) |

> ⚠️ `NEXT_PUBLIC_*` фиксируются **на этапе сборки** в CI (GitHub Secrets), не в рантайме. Смена тест↔бой требует пересборки/редеплоя, а не только правки `.env.production`.

---

## 5. Контуры: тест vs бой

### Тестовый (СЕЙЧАС, `NEXT_PUBLIC_PAYMENTS_MODE=test`)

| Переменная | Значение |
|-----------|----------|
| `EPAY_OAUTH_URL` | `https://test-epay-oauth.epayment.kz/oauth2/token` |
| `NEXT_PUBLIC_EPAY_JS_URL` | `https://test-epay.epayment.kz/payform/payment-api.js` |
| `NEXT_PUBLIC_PAYMENTS_MODE` | `test` |

### Боевой (целевой, после получения ключей банка)

5 значений под замену:
| Переменная | Боевое значение |
|-----------|-----------------|
| `EPAY_OAUTH_URL` | `https://epay-oauth.homebank.kz/oauth2/token` |
| `NEXT_PUBLIC_EPAY_JS_URL` | `https://epay.homebank.kz/payform/payment-api.js` |
| `NEXT_PUBLIC_PAYMENTS_MODE` | `live` |
| `EPAY_CLIENT_ID` | боевой от Halyk |
| `EPAY_CLIENT_SECRET` | боевой от Halyk |

(плюс боевой `EPAY_TERMINAL_ID`, если отличается от тестового — уточнить у банка)

> Историческая заметка: коммиты `abeb374` / `b773992` метались между `homebank.kz` и `epayment.kz` — на тесте рабочий хост `epayment.kz`, боевой `homebank.kz`.

### Тестовые карты epay (Halyk)
- **TODO**: уточнить актуальный список тестовых карт у Halyk Bank. Типовой набор epay — успешная `4405 6390 0214 3199` (exp 01/25, CVV 815) и отклоняемая карта; **проверить в кабинете мерчанта перед использованием**.

---

## 6. Переход на боевой контур — чек-лист

- [ ] Получить от Halyk боевые `EPAY_CLIENT_ID`, `EPAY_CLIENT_SECRET`, `EPAY_TERMINAL_ID`.
- [ ] Обновить `EPAY_OAUTH_URL` (homebank.kz) в `.env.production` на VPS.
- [ ] Обновить GitHub Secrets `NEXT_PUBLIC_EPAY_JS_URL` (homebank.kz) и `NEXT_PUBLIC_PAYMENTS_MODE=live`.
- [ ] Убедиться, что сайт доступен по публичному HTTPS-домену (postlink без TLS не дойдёт — см. `docs/INFRA.md` чек-лист DNS).
- [ ] Зарегистрировать postlink-URL `https://uralskflowers.kz/api/payments/postlink` в кабинете мерчанта (если требуется).
- [ ] Редеплой (push в main → пересборка с боевыми `NEXT_PUBLIC_*`).
- [ ] Контрольный платёж на минимальную сумму реальной картой → проверить `payments.status=success`, заказ в админке, Telegram/WhatsApp.

---

## 7. Грабли (известные)

| Грабли | Суть |
|--------|------|
| **INV-префикс запрещён** | `invoice_id` — только цифры, 6–15 знаков. Никаких буквенных префиксов. |
| **postlink требует публичный HTTPS** | На голом IP без TLS банк не достучится — оплата «зависнет» в `created`. |
| **NEXT_PUBLIC_* вшиваются при сборке** | Переключение тест/бой — это редеплой, не рантайм-правка. |
| **Токен оплаты одноразовый, ~20 мин** | OAuth-токен из init живёт ограниченно и на один платёж. Повторная оплата (`retryPayment`) дёргает init заново. |
| **Поллинг до 120с, таймаут ≠ отказ** | Postlink может прийти с задержкой 1–3 мин. По таймауту показываем `timeout` (не `failed`) — платёж мог пройти; статус подтвердит postlink. |
| **Заказ скрыт до оплаты** | `pending + unpaid` не виден в админ-канбане; появляется только после `paid`. |

---

## 8. Публичный юридический слой (требование банка)

Подключён для прохождения проверки Halyk Bank / epay (коммит `b85b10b`, финализация `56d8c52`/`fac2b2f`).

- **`src/config/company.ts`** — единый источник реквизитов:
  - Бренд: «Цветы Уральска»
  - ИП Тропин Валерий Алексеевич, ИИН `610803301378`
  - ИИК `KZ256017181000005303`, АО «Народный Банк Казахстана», БИК `HSBKKZKX`, КБЕ `19`
  - Домен `uralskflowers.kz`, тел `+7 700 757 5243`, e-mail `opt.uralsk@gmail.com`
  - Адрес: ЗКО, г. Уральск, ул. Амангельды Каримуллина, 11
- **Статичные страницы** (без авторизации): `/legal/oferta`, `/legal/privacy`, `/legal/personal-data`, `/payment`, `/delivery`, `/returns`, `/contacts`. Исходники — `docs/legal-content/*.md`, рендер через `src/components/LegalPage.tsx`.
- **`SiteFooter`** — реквизиты, ссылки на правовые документы, логотипы платёжных систем (`public/payment-logos/`: Visa, Mastercard, UnionPay, Visa Secure, MC ID Check, epay — локальные SVG, без хотлинков).
- **`AboutBlock`** на главной (сворачивается на мобиле).
- `metadataBase` → `https://uralskflowers.kz`, хардкоды `vercel.app` из метаданных убраны (`56d8c52`).

См. также `docs/BANK_AUDIT_2026-06-04.md` — аудит готовности к подключению (часть пунктов с тех пор закрыта: реквизиты, оферта, footer, поля оплаты в `orders` — сделаны).

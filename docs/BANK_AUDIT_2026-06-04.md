# Аудит flowers-b2b для Halyk Bank / epay — 04.06.2026

> Режим: только чтение. Источник истины — текущий код и Supabase.

---

## 1. Изменения за 7 дней (git log)

**Всего коммитов за 7 дней: 26. Рабочее дерево чистое (нет незакоммиченного).**

| Категория | Основные коммиты |
|-----------|-----------------|
| **amoCRM** | `48696e1` интеграция предзаказов; `f7e08a8` витринные заказы; `123e938` движение по воронке; `d226b7d` исправление имён контактов |
| **Фото/UI** | `1f45ef1` замена remove.bg на @imgly (клиентская сторона); `fe73125` ховер N фото (extra_images); `42fb95d` белый фон |
| **Фильтры** | `334676f` новые подкатегории, subgroup-вкладки, фильтр объёма, variant labels; `f4d659e` dried/artificial; `873d777` исправление facets |
| **Каталог** | `aa196b5` сортировка по остатку; `aa7452b` кликабельные хлебные крошки; `3689eb7` source-фильтр витрины |
| **Prочее** | `ada1bec` Umnico через next/script; `0191072` поиск не персистируется |

---

## 2. Карта маршрутов

### Страницы (app/**/page.tsx)

| Маршрут | Доступ | Защита (фактически) |
|---------|--------|---------------------|
| `/` | **Публичный** | Нет |
| `/product/[id]` | **Публичный** | Нет |
| `/login` | Редирект → `/` | `redirect('/')` (server) |
| `/register` | Публичный | Нет — проверить содержимое |
| `/preorder/[id]` | Публичный + access_token | Cookie `preorder_token_*` проверяется в RPC |
| `/campaigns`, `/campaigns/[id]` | Публичный | Нет |
| `/cabinet` | Клиент | **Client-side** `useAuthStore` + `router.push('/')` |
| `/inventory` | Клиент/admin | **Client-side** |
| `/admin` | Admin/manager | **Client-side** `role !== 'admin' && role !== 'manager'` → редирект |
| `/admin/orders` | Admin/manager | **Client-side** |
| `/admin/campaigns/*` | Admin/manager | **Client-side** |
| `/admin/preorders` | Admin/manager | **Client-side** |
| `/admin/cashier` | Admin/manager | **Client-side** |
| `/admin/generate-cards` | Admin/manager | **Client-side** |
| `/admin/import/*` | Admin/manager | **Client-side** |
| `/admin/translations/*` | Admin/manager | **Client-side** |
| `/print/order/[id]` | Публичный | Нет |

⚠️ **Все /admin/* защищены ТОЛЬКО на клиенте** — серверного middleware нет. Прямой HTTP-запрос к странице вернёт HTML.

### API-роуты (51 файл)

| Группа | Маршруты | Защита сервера |
|--------|----------|----------------|
| **Открытые read** | `/api/products`, `/api/facets`, `/api/search-products` | Нет (GET, read-only) |
| **Открытые write** | `/api/checkout`, `/api/preorder/[id]/join` | Нет — создают записи без токена |
| **Клиент (phone)** | `/api/my-orders`, `/api/cabinet`, `/api/client/*` | `userId` из тела запроса (доверяем клиенту) |
| **Admin (secret)** | `/api/import-xls*`, `/api/import-oz-preorder` | `x-import-secret` / `ADMIN_ACTION_SECRET` header |
| **Cron** | `/api/cron/cleanup` | `Authorization: Bearer CRON_SECRET` |
| **Прочее** | `/api/orders/[id]`, `/api/manager-order`, `/api/preorder/launch` | Без server-auth; `userId`/`changed_by` из тела |

---

## 3. Публичный слой

### Что видит неавторизованный посетитель

- **Каталог `/`**: товары видны, карточки с фото и названиями — ✅
- **Цены**: скрыты для `cut` и `pot` (`●●● ₸`); для `accessories` цены **открыты публично** — ✅/⚠️
- **Страница товара `/product/[id]`**: открыта — ✅
- **Корзина**: кнопка «В корзину» есть, но при клике запрашивается телефон через AuthModal

### Чего НЕТ — критично для банка

| Требование Halyk Bank / epay | Статус |
|------------------------------|--------|
| **Реквизиты ТОО** (БИН, юр. адрес, телефон, email) | ❌ Отсутствует |
| **Оферта / Пользовательское соглашение** | ❌ Нет страницы |
| **Политика конфиденциальности** | ❌ Нет страницы |
| **Условия оплаты** | ❌ Нет страницы |
| **Политика возврата** | ❌ Нет страницы |
| **Условия доставки** | ❌ Нет страницы |
| **Footer** с реквизитами и ссылками | ❌ Footer отсутствует в layout |
| **Логотипы Visa / Mastercard / epay** | ❌ Нет нигде |
| **Контактная информация** | ❌ Нет |

### Что есть

- Umnico онлайн-чат (виджет загружается через next/script)
- Vercel Analytics
- Telegram/WhatsApp уведомления (backend)

### Битые ссылки и редиректы

- `/login` → редирект на `/` (сервер)
- Внешние ресурсы: `umnico.com` (чат-виджет), `api.telegram.org`, `google.serper.dev`, `umnico.com/assets/widget-loader.js`

---

## 4. Схема заказов

### `orders` — витринные заказы

| Поле | Тип | Значение |
|------|-----|---------|
| `id` | integer | Автоинкремент (1, 2, 3…) — **НЕ UUID** |
| `client_id` | uuid | FK → clients/auth.users |
| `guest_phone` | text | Для гостей (не задействовано у витрины) |
| `status` | enum | `cart → pending → reserved → confirmed → in_transit → arrived → assembling → assembled → delivered → cancelled` |
| `total` | numeric | Итоговая сумма |
| `payment_method` | text | Заполняется вручную менеджером |
| `payment_comment` | text | Комментарий |
| `created_at` | timestamptz | — |

⚠️ **Полей для эквайринга нет:**
- `paid_at` — **отсутствует**
- `payment_id` / `transaction_id` (epay) — **отсутствует**
- `payment_status` — **отсутствует**
- `payment_amount` (на случай частичной оплаты) — **отсутствует**

### `campaign_orders` — предзаказы

Аналогичная схема. Дополнительно: `amo_lead_id`, `amo_contact_id`, `amo_synced_at`. Полей оплаты также нет.

### Вывод для интеграции epay

Перед подключением epay нужно добавить в `orders`:
```sql
ALTER TABLE orders ADD COLUMN paid_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN payment_id TEXT;        -- epay transaction ID
ALTER TABLE orders ADD COLUMN payment_status TEXT;    -- pending/paid/failed/refunded
ALTER TABLE orders ADD COLUMN payment_amount NUMERIC; -- фактически оплаченная сумма
```

---

## 5. Vercel и окружение

### Проект

| Параметр | Значение |
|----------|---------|
| projectId | `prj_k80BCcMseVVbEQP3tOu46yQzmgXT` |
| orgId | `team_NyU4Y0SDJBVTXLbswr41VFH5` |
| Prod URL | `https://flowers-b2b-phi.vercel.app` |
| Framework | Next.js 16 (Turbopack по умолчанию) |

### Переменные окружения (.env.local — имена)

```
ADMIN_ACTION_SECRET
AMO_ACCESS_TOKEN
CRON_SECRET
GOOGLE_API_KEY
GOOGLE_CX
GOOGLE_GEMINI_API_KEY
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_SUPABASE_URL
OZ_IMPORT_SECRET
OZ_IMPORT_URL
SERPER_API_KEY
SUPABASE_SERVICE_ROLE_KEY
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID
UMNICO_API_TOKEN
UMNICO_MANAGER_PHONE
UMNICO_WHATSAPP_SA_ID
```

**Для epay потребуются добавить:**
- `EPAY_MERCHANT_ID`
- `EPAY_SECRET_KEY` (или `EPAY_PRIVATE_KEY`)
- `EPAY_API_URL`

---

## 6. Безопасность

### Открытые write-роуты (без серверной аутентификации)

| Роут | Что делает | Риск |
|------|-----------|------|
| `POST /api/checkout` | Создаёт заказ в `orders`, резервирования | Можно создавать заказы от чужого имени |
| `POST /api/preorder/[id]/join` | Создаёт запись в `campaign_access` | Можно флудить запросами |
| `PATCH /api/orders/[id]` | Меняет статус заказа | `changed_by` берётся из тела — не верифицируется |
| `POST /api/manager-order` | Меняет статус + списывает остатки | Нет проверки роли на сервере |

### RLS

**RLS отключён** на таблицах: `orders`, `order_items`, `products`, `clients`, `reservations`, `inventory_ledger`, `varieties`.

**RLS включён только** на: `profiles`, `campaign_items` (select).

### SECURITY DEFINER RPC (29 функций)

Все доступны через anon-ключ (PostgREST не закрыт по роли). Защита — только клиентский гард на /admin.

Наиболее чувствительные:
- `admin_set_preorder_status` — меняет статусы предзаказов
- `admin_assemble_preorder` — фиксирует сборку
- `admin_bulk_preorder_status` — массовая смена статуса
- `admin_save_preorder_edits` — правка позиций заказа
- `admin_admit_request` — впускает клиентов в комнату
- `confirm_order_fifo` — списывает остатки

⚠️ **Любой, кто знает имя RPC, может вызвать его через Supabase анон-ключ** (NEXT_PUBLIC_SUPABASE_ANON_KEY виден в браузере).

---

## Резюме для банка (10 строк)

```
ЧТО ЕСТЬ:
✅ Работающий каталог с товарами и фото (публично)
✅ Система заказов (orders) с суммой, статусами, клиентом
✅ Уведомления через Telegram/WhatsApp при создании заказа
✅ amoCRM интеграция (сделки создаются автоматически)
✅ Аутентификация клиентов по телефону + PIN

ЧЕГО НЕТ (требуется для Halyk Bank / epay):
❌ Реквизиты ТОО, оферта, политика конфиденциальности, условия возврата/доставки/оплаты
❌ Footer с контактами и логотипами Visa/Mastercard/epay
❌ Поля в orders для платёжных транзакций: paid_at, payment_id, payment_status
❌ Серверная аутентификация на write-роутах (защита клиентская)
❌ Собственный домен (сейчас flowers-b2b-phi.vercel.app)
```

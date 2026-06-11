# План RLS-защиты: clients / orders / order_items

**Статус: ПЛАН, не внедрено.** Дата аудита: 11.06.2026. БД: flower-stock (jwastcmasactymmzojhi).
Цель — закрыть прямой доступ браузерным anon-ключом к `clients`, `orders`, `order_items`
(сейчас любой посетитель с публичным ключом читает **все** заказы и клиентов и может **UPDATE любого клиента** — см. §1.3).

---

## 0. Текущее состояние (снимок 11.06.2026)

| Таблица | RLS | Политик | Комментарий |
|---|---|---|---|
| `clients` | ❌ выкл | 5 спящих | открыта целиком |
| `orders` | ❌ выкл | 8 спящих | открыта целиком |
| `order_items` | ❌ выкл | 6 спящих | открыта целиком |
| `inventory_ledger` | ❌ выкл | 2 спящих | открыта целиком |
| `order_history` | ❌ выкл | 2 спящих | открыта целиком (смежная, в скоуп добавить) |
| `favorites` | ❌ выкл | 0 | браузер пишет напрямую (отдельный этап, см. §6) |
| `payments` | ✅ вкл | 0 | **уже deny-all** — трогать не надо |
| `reservations` | ✅ вкл | 4 | рабочие политики (own + admin) — трогать не надо |
| `profiles` | ✅ вкл | 4 | ок |
| `campaign_orders` / `campaign_order_items` | ✅ вкл | 4+4 | ок (закрыты на пред. этапе) |

**Гранты (information_schema.role_table_grants):** у `anon` и `authenticated` на всех шести таблицах
полный набор — `SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER`.
⚠️ `TRUNCATE` **не подчиняется RLS** — включение RLS его не закрывает, нужен REVOKE (см. шаг 4).

**Ключевой факт о модели данных:** `orders.client_id → clients.id`, при этом
**0 из 31** заказов имеют `client_id = auth.uid()`, и только **2 из 125** клиентов имеют `id = auth.uid()`.
Привязка клиента к auth-пользователю идёт **по телефону**, не по UUID.
→ Все спящие политики вида `client_id = auth.uid()` / `id = auth.uid()` — **мёртвые**: после включения
RLS они не дадут клиенту ни одной его строки. Клиентский доступ возможен только через серверные роуты
(резолв по телефону из токена — как уже сделано в `/api/cabinet` на IDOR-этапе).

---

## 1. Спящие политики — инвентаризация и решения

`is_admin_or_manager()` — SECURITY DEFINER, читает `profiles.role` по `auth.uid()`. Рабочая, оставляем.

### 1.1 `clients` (5 политик)

| Политика | cmd | Что разрешает | Решение |
|---|---|---|---|
| `clients: admin reads all` | SELECT | admin/manager читает всё | **оставить** (объединим в admin all) |
| `clients: admin write` | ALL | admin/manager пишет всё | **оставить** |
| `clients: insert by server` | INSERT | `WITH CHECK (true)` — **кто угодно, включая anon** | 🔴 **удалить** |
| `clients: read own` | SELECT | `id = auth.uid()` — мёртвая (2/125 совпадений) | **удалить** |
| `clients: update by server` | UPDATE | `USING true / CHECK true` — **anon может UPDATE любого клиента**. Это вторая дыра: она «выстрелит» в момент включения RLS, если её не удалить | 🔴 **удалить** |

### 1.2 `orders` (8 политик)

| Политика | cmd | Что разрешает | Решение |
|---|---|---|---|
| `orders: admin all` | ALL | admin/manager всё | **оставить** |
| `Clients can view their own orders` | SELECT | `client_id = auth.uid()` — мёртвая | **удалить** |
| `orders: client reads own` | SELECT | дубль предыдущей — мёртвая | **удалить** |
| `Clients can update their own orders` | UPDATE | `client_id = auth.uid()` — мёртвая | **удалить** |
| `orders: client updates own cart` | UPDATE | мёртвая + статус `cart` не используется (0 строк) | **удалить** |
| `orders: guest creates` | INSERT | анонимное создание заказов без client_id | 🔴 **удалить** (гостевых заказов нет: 0 строк с client_id IS NULL; checkout — серверный) |
| `orders: guest update own` | UPDATE | **любой anon правит любой гостевой заказ** | 🔴 **удалить** |
| `orders: insert with client` | INSERT | `WITH CHECK (true)` — кто угодно | 🔴 **удалить** |

### 1.3 `order_items` (6 политик)

| Политика | cmd | Что разрешает | Решение |
|---|---|---|---|
| `order_items: admin all` | ALL | admin/manager всё | **оставить** |
| `order_items: client reads own` | SELECT | через orders.client_id=auth.uid() — мёртвая | **удалить** |
| `Clients can update their order items` | UPDATE | мёртвая | **удалить** |
| `order_items: client writes own cart` | ALL | мёртвая (status='cart' не используется) | **удалить** |
| `order_items: guest insert` | INSERT | anon вставляет позиции в гостевые заказы | 🔴 **удалить** |
| `order_items: insert by server` | INSERT | `WITH CHECK (true)` — кто угодно | 🔴 **удалить** |

### 1.4 `inventory_ledger` (2) и `order_history` (2)

`ledger: admin reads all` (SELECT) + `ledger: admin inserts` (INSERT) — обе на `is_admin_or_manager()`,
безопасные → **оставить**, RLS включить. Политики `order_history` свериться при миграции (ожидаемо
admin-политики; если есть `true`-политики — удалить по тому же принципу).

---

## 2. Браузерные обращения к clients / orders / order_items

Полный проход по `src/` (`.from('clients'|'orders'|'order_items')` + проверка, каким клиентом).

### 2.1 Клиентская часть (не-админ) — **2 места, переключить на роуты**

| # | Файл | Операция | Чем заменить |
|---|---|---|---|
| 1 | `src/app/cabinet/page.tsx:70` | `clients` SELECT name, company_name по phone | расширить ответ **существующего** `/api/cabinet` (он уже резолвит клиента по токену и возвращает `client.name/phone` — добавить `company_name`), убрать прямой запрос |
| 2 | `src/lib/favorites-store.ts:38` | `clients` SELECT id по phone (резолв clientId для избранного) | **новый** мини-роут `GET /api/client/resolve` (Bearer → phone → clients.id), либо вернуть clientId из `/api/cabinet`. Сам `favorites` toggle остаётся как есть (отдельный этап, §6) |

### 2.2 Админ/менеджер-компоненты — **5 файлов; при рекомендуемой модели (§3) НЕ трогаем**

Все работают браузерным клиентом **с admin-сессией** → политики `is_admin_or_manager()` их покрывают.

| # | Файл | Операции | Под admin-политикой |
|---|---|---|---|
| 3 | `src/components/admin/OrdersPanel.tsx:168` | `orders` SELECT (+вложенные order_items, reservations, client) | ✅ работает |
| | `OrdersPanel.tsx:239` | `order_items` UPDATE qty | ✅ |
| | `OrdersPanel.tsx:245–248` | DELETE reservations / order_history / order_items / orders (удаление заказа) | ✅ (reservations — уже есть admin-политика; order_history — добавить admin-политику при миграции) |
| 4 | `src/app/admin/orders/OrdersKanban.tsx:68` | `orders` SELECT + **Realtime** `postgres_changes` на orders; статусы меняет через `/api/orders/[id]` | ✅; Realtime под RLS отдаёт события только тем, кому виден row — admin-политика сохраняет канбан живым |
| 5 | `src/components/admin/CashierView.tsx:77` | `clients` SELECT (список) | ✅ (заказ создаёт через `/api/manager-order`) |
| 6 | `src/components/admin/NewOrderModal.tsx:28` | `clients` SELECT (список) | ✅ (заказ — через `/api/manager-order`) |
| 7 | `src/components/admin/OrderEditModal.tsx:111–135` | `order_items` INSERT/UPDATE/DELETE + `orders` UPDATE total | ✅ |

Если выбрать строгий deny-all и для админки — эти 5 файлов придётся переводить на новые admin-роуты
(~8 операций + замена Realtime на polling). Отложено как фаза 2 (§6).

### 2.3 Серверные роуты на **anon-ключе** (`@/lib/supabase/server`) — сломаются при включении RLS

Сессия живёт в localStorage → серверный клиент куки не получает → он **anon**. После deny-all эти
роуты получат пустые ответы/ошибки. Перевести на `createAdminClient()` (service role; работает и на
VPS, и на Vercel — там уже живут payments/init и др.):

| Роут | Таблицы |
|---|---|
| `/api/cabinet` | clients, orders (+items) |
| `/api/checkout` | clients, orders, order_items, reservations |
| `/api/my-orders` | orders |
| `/api/export-orders` | orders (+items, clients) |
| `/api/orders/[id]` (PATCH) | orders |
| `/api/orders/[id]/assemble` | orders, order_items |
| `/api/manager-order` | orders, order_items, clients |
| `/api/whatsapp-bot` | clients, orders |
| `/api/auth/phone` | clients |
| `/api/auth/verify-pin` | clients |
| `/api/orders/[id]/history` | смешанный (admin уже есть — досмотреть anon-части) |
| страница `src/app/print/order/[id]/page.tsx` | orders (server component на anon-ключе) → admin client; доступ — см. риск R5 |

Авторизация в этих роутах уже есть или добавлена на IDOR-этапе (`getAuthedUser` / `getAuthedWithRole`
из `src/lib/api-auth.ts`); замена клиента её не меняет.
Роуты, уже сидящие на `createAdminClient` (payments/*, admin/clients, client/*, campaigns/*, amo.ts,
preorder-actions и др.) — не трогаем.

Примечание: `/api/cancel-order`, `/api/confirm-order`, `/api/reserve`, `/api/update-order-qty` —
папки пустые, роуты удалены (CLAUDE.md устарел в этой части).

---

## 3. Модель доступа (предложение)

**Рекомендую гибрид «server-only для клиентов + admin-политики для админки»:**

1. **Клиентские операции** (кабинет, чекаут, избранное-резолв) — только через серверные роуты
   с Bearer-токен-проверкой (паттерн IDOR-этапа). RLS для роли «клиент» — deny-all.
   *Обоснование:* политики по `auth.uid()` физически не могут работать — привязка по телефону (§0).
2. **Админка** — оставляем по одной политике `FOR ALL ... USING (is_admin_or_manager()) WITH CHECK (is_admin_or_manager())`
   на `clients`, `orders`, `order_items` (+ существующие на `inventory_ledger`, + добавить на `order_history`).
   *Обоснование:* (а) Realtime-канбан продолжает работать (под RLS события приходят только тем, кому
   строка видна — admin-политика это покрывает); (б) 5 админ-компонентов не переписываем сейчас;
   (в) утечки нет — политика требует JWT с ролью admin/manager из `profiles`.
3. **Анонимный доступ к этим таблицам не нужен нигде.** Гостевых заказов нет (0 строк), гостевые
   политики удаляем. Каталог (`products`) в этом этапе не трогаем.
4. **Серверные роуты** — `createAdminClient()` (service role, обходит RLS). На VPS работает,
   на Vercel preview работает (payments уже там) — перед включением проверить env на обоих.
5. Защита в глубину: `REVOKE TRUNCATE, REFERENCES, TRIGGER, DELETE ON ... FROM anon, authenticated`
   (DELETE оставить только authenticated — нужен админ-компонентам через политику; у anon отозвать всё кроме SELECT-задела… проще: anon → REVOKE ALL, authenticated → оставить SELECT/INSERT/UPDATE/DELETE под политиками).

Базовый вариант из ТЗ (deny-all вообще без политик + переписать админку на роуты) — валиден, но
дороже: +5 компонентов, +3–4 новых admin-роута, замена Realtime на polling, и всё это без выигрыша
в безопасности относительно гибрида. Предлагаю его как фазу 2 — по желанию (§6).

---

## 4. Порядок внедрения (сайт рабочий на каждом шаге)

> Всё через preview (Vercel) → прод. Перед шагом 4 — снимок сервера/БД.

### Шаг 0 — подготовка
- Снимок политик уже в этом доке; сделать backup БД (Supabase → Database → Backups / `pg_dump`).
- Проверить env: `SUPABASE_SERVICE_ROLE_KEY` есть на VPS **и** на Vercel preview.
- Git tag `pre-rls`.

### Шаг 1 — серверные роуты: anon-клиент → `createAdminClient()` (≈12 файлов из §2.3)
Поведение не меняется (RLS ещё выключен — admin-клиент читает то же самое). Чисто механическая замена.
- **Проверка:** кабинет (заказы+имя), чекаут с тестовой оплатой epay, my-orders, экспорт заказов,
  смена статуса в канбане, сборка, manager-order из кассы, вход по PIN, печать заказа.
- **Откат:** `git revert` одного коммита.

### Шаг 2 — браузер → роуты (2 места из §2.1)
- `/api/cabinet`: добавить `company_name` в ответ; `cabinet/page.tsx` убрать прямой запрос.
- `favorites-store`: clientId через новый `GET /api/client/resolve` (Bearer).
- **Проверка:** кабинет показывает имя/компанию; избранное грузится и тогглится у клиента; гость видит призыв войти.
- **Откат:** `git revert`.

### Шаг 3 — миграция политик (БД, **без включения RLS**)
Одной миграцией: DROP всех политик из §1 с пометкой «удалить»; CREATE недостающие admin-политики
(`order_history`); политики на выключенном RLS ни на что не влияют → шаг безопасен.
- **Проверка:** сайт работает как раньше (RLS всё ещё выключен).
- **Откат:** обратная миграция (CREATE удалённых не требуется — они были мёртвые/опасные; достаточно ничего не делать).

### Шаг 4 — включение RLS + REVOKE (самый ответственный)
```sql
ALTER TABLE clients          ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders           ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_history    ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON clients, orders, order_items, inventory_ledger, order_history FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON clients, orders, order_items, inventory_ledger, order_history FROM authenticated;
```
Сначала на **ветке-превью БД нет** (Supabase один на prod/preview!) — поэтому: включать в окно
минимального трафика, прокликать сразу же.
- **Проверка (curl, anon-ключ):**
  `curl "$SUPABASE_URL/rest/v1/orders?select=id" -H "apikey: $ANON"` → `[]` или 401/permission denied;
  то же для clients, order_items.
- **Проверка (сайт):** полный круг — каталог, вход клиента, кабинет, избранное, корзина → чекаут →
  тестовая оплата → заказ виден в канбане; админ: канбан (+убедиться, что Realtime-события приходят),
  OrdersPanel (правка qty, удаление тестового заказа), касса + NewOrderModal, OrderEditModal,
  экспорт, печать, предзаказы.
- **Откат (мгновенный, без деплоя):**
  `ALTER TABLE ... DISABLE ROW LEVEL SECURITY;` + `GRANT` обратно при необходимости.

### Шаг 5 — контроль
- Supabase Advisors → предупреждения по этим таблицам должны уйти.
- 2–3 дня смотреть логи API (`get_logs`) на 401/пустые ответы.

---

## 5. Оценка рисков

| Риск | Степень | Митигация |
|---|---|---|
| **R1. Пропущенный anon-путь** — какой-то код тихо получит `data=null` после шага 4 (симптом как у PostgREST max_rows: пустой экран без ошибки) | 🔴 высокая | шаги 1–2 закрывают все найденные места; чек-лист прогона в шаге 4; мгновенный откат DISABLE RLS |
| **R2. Realtime канбана** перестанет получать события, если admin-JWT не доедет до канала | 🟡 средняя | admin-политика SELECT сохраняет события; проверить руками на превью; fallback — polling 15с (маленький патч) |
| **R3. Service role на Vercel preview** (стейджинг) | 🟡 средняя | ключ уже используется (payments) — проверить env до шага 1 |
| **R4. Бэкграунд-потоки**: postlink (оплата), whatsapp-bot, телеграм-уведомления, amoCRM-sync пишут в orders/clients | 🟡 средняя | все уже на admin-клиенте, кроме whatsapp-bot (шаг 1); прогнать тестовую оплату на шаге 4 |
| **R5. `/print/order/[id]`** — после перевода на admin-клиент страница будет открывать любой заказ по URL без auth (сейчас так же, но через дыру) | 🟡 средняя | в шаге 1 перевести на admin-клиент как есть (не хуже текущего); отдельной задачей — клиентский fetch с Bearer + роль |
| **R6. Один Supabase на prod и preview** — RLS включается «для всех» сразу | 🟡 средняя | шаги 1–3 раскатать и проверить заранее; шаг 4 делать в окно низкого трафика со снимком |
| **R7. Забытая политика `clients: update by server` (USING true)** — если включить RLS, не удалив её, дыра UPDATE останется | 🔴 высокая | шаг 3 (DROP) идёт строго до шага 4; чек в миграции: `SELECT count(*) FROM pg_policies WHERE tablename='clients'` = 1 |

**Объём работ:** ~12 серверных файлов (механическая замена клиента, шаг 1), 2 клиентских места
(шаг 2), 2 миграции БД (шаги 3–4). Админ-компоненты — 0 файлов (гибридная модель).

---

## 6. Вне скоупа этого этапа (бэклог)

- **favorites**: RLS выключен, браузер пишет напрямую. После этапа — либо серверный роут, либо
  политика `client_id = auth.uid()` (потребует перевязать favorites.client_id на auth uid — сейчас это clients.id).
- **Строгий deny-all для админки** (фаза 2): OrdersPanel/Kanban/CashierView/NewOrderModal/OrderEditModal
  → admin-роуты, Realtime → polling. Выигрыш — меньше поверхность атаки при утечке admin-аккаунта.
- **reservations**: политика `reservations_insert_authenticated` разрешает INSERT любому залогиненному —
  ужесточить (client_id = auth.uid() не сработает — та же проблема телефонной привязки; через серверные роуты).
- **products**: RLS выключен (витрина публичная — SELECT ок, но INSERT/UPDATE открыты anon). Отдельный этап.
- Привязка `clients.id = auth.uid()` для новых клиентов — устранила бы «телефонную» косвенность и
  открыла классические RLS-политики. Большая миграция, обсудить отдельно.

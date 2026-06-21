# Технический контекст под нативный AI-виджет-консультант

> ТЗ-контекст для встраивания собственного AI-виджета на сайт (замена виджета Umnico).
> Мозг бота — `src/lib/bot/accessories-bot.ts` — переиспользуется. Всё ниже — **из кода**
> (на 21.06.2026), не из брендбука/доков. Где чего-то нет — помечено «НЕТ, нужно создать».

---

## 1. Аутентификация и сессия

- **Вход — телефон + PIN.** `src/lib/auth-store.ts` → `login(phone, pin)`:
  `supabase.auth.signInWithPassword({ email, password: pin })`, где
  `email = normalizePhone(phone).replace('+','') + '@flowers.local'`
  (`normalizePhone` из `src/lib/phone.ts`). Формат телефона везде `+7XXXXXXXXXX`.
- **Сессия — Supabase Auth** (`@supabase/supabase-js`), хранится в **localStorage**
  (ключ supabase-сессии). Singleton-клиент — `src/lib/supabase/client.ts` (`createClient()`).
  `@supabase/ssr` есть в зависимостях, но cookie-сессии для клиента **не используются**
  (auth целиком клиентский; в API `userId`/`phone` приходят в теле запроса).
- **Состояние авторизации — Zustand-стор `useAuthStore`** (`src/lib/auth-store.ts`),
  модульный синглтон. Поля: `user: { id } | null`, `role: 'admin'|'manager'|'client'|null`,
  `phone: string | null`, `isAuthed: boolean`; методы `init()`, `login()`, `logout()`.
  Восстановление сессии — через `onAuthStateChange('INITIAL_SESSION')` (срабатывает на
  загрузке, до useEffect). В компоненте:
  ```ts
  const { isAuthed, user, phone, role } = useAuthStore()
  ```
- **Кто залогинен:** `user.id` = **Supabase Auth UUID = `profiles.id`** (роль/телефон в `profiles`).

### ⚠️ `client_id` — важное различие
- `orders.client_id` ссылается на **`clients.id` (uuid)**, и это **НЕ** `user.id`/`profiles.id`.
- `clients` матчится **по телефону** (`normalizePhone`), не по auth-id. Резолв происходит
  **на сервере**: `/api/checkout` и `/api/cabinet/route.ts` ищут `clients` по `phone`
  (создают при отсутствии). Кабинет/предзаказы линкуются по `profiles.id` (см.
  `checkoutPreorder`), а заказы — по `clients.id`.
- **Вывод для виджета:** на клиенте достаём из `useAuthStore` только **`phone`** (и `user.id`).
  `clients.id` напрямую с клиента **недоступен** — заказы оформляются phone-based потоком
  (как `/api/checkout`). Отдельного «client_id на фронте» НЕТ.

---

## 2. Корзина

- **`src/lib/cart-store.ts`** — Zustand + `persist` (localStorage, ключ **`cart`**, version 1).
  Модульный синглтон `useCart`.
- **`CartItem`:**
  ```ts
  type CartItem = {
    id: number          // = product_id
    name: string
    price: number
    qty: number
    available: number   // остаток (products.qty) — потолок qty
    category: string
    image_url?: string | null
    unit?: string | null
    subcategory?: string | null
    color?: string | null   // снимок выбранного цвета (Вариант А), ярлык не SKU
  }
  ```
  ⚠️ `pack_size` в `CartItem` **НЕТ** — кратность живёт на товаре (`products.pack_size`/
  `stems_per_pack`); шаг степпера задаёт UI, в корзине хранится итоговый `qty` в штуках.
- **Идентичность строки — составной ключ `id + color`** (`sameLine`): один товар разных
  цветов = разные строки.
- **API стора:**
  - `add(item: Omit<CartItem,'qty'>)` — добавляет строку с `qty:1`; если строка
    (`id+color`) уже есть → `qty = min(qty+1, available)`.
  - `update(id, qty, color?)` — ставит точное `qty` (0 → удаляет строку).
  - `remove(id, color?)`, `clear()`, `total()`.
- **Программно положить в ТУ ЖЕ корзину** (как делает грид/DetailPanel):
  ```ts
  const { add, update } = useCart()           // или useCart.getState() вне React
  add({ id, name, price, available, category, image_url, unit, subcategory, color })
  update(id, qty, color)                       // выставить нужное количество
  ```
  Кнопка «В корзину» из виджета = ровно этот вызов; корзина общая (синглтон + persist),
  шапка/`/cart` подхватят автоматически.

---

## 3. Каталог / товары

- **Таблица `products`** — плоская схема. Поля под карточку (как в select `/api/products`):
  `id`, `name` (raw из 1С), `display_name`, `price`, `previous_price`, `qty`,
  `image_url`, `campaign_image_url`, `extra_images[]`, `color_images`, `colors[]`,
  `category` (`cut`/`pot`/`accessories`), `subcategory`, `subgroup`, `pack_size`,
  `stems_per_pack`, `unit`, `length_cm`, `country_iso`, `farm`, `supplier`, `tags[]`,
  `quality_grade`, `volume_l`, `price_per_m`/`price_per_m2`, `short_description`,
  `description`, `source`.
- **Роут карточки товара:** `src/app/product/[id]/page.tsx` → URL `/product/{id}` (клиентская).
- **Как фронт получает товары:**
  - **`GET /api/products`** (`src/app/api/products/route.ts`) — весь каталог
    (`is_active=true AND source IN ('uralsk_site','uralsk_1c')`, `limit(5000)`).
    `?catalog=1` — включая `qty=0`. `?search=` — ILIKE + RPC `expand_search_query`.
    Ответ: массив товаров, к каждому добавлен `is_new` и `stock { price, qty, available_qty, … }`.
  - **`GET /api/search?q=…&category=…&subcategory=…`** (`src/app/api/search/route.ts`) —
    серверный поиск через RPC `search_products` (ранжирование + similarity-фолбэк),
    синонимы `expandSearchQuery`. Ответ: `{ products: SearchProduct[], categories:
    {slug,label,count}[], degraded? }`. `SearchProduct` = `{ id, name, display_name,
    subcategory, category, price, qty, image_url, rank, sim }`.
  - Главная витрина (`src/app/page.tsx`) грузит каталог **server-side** через
    `fetchAllProducts()` (пагинация `.range()` по 900 строк — обход `max_rows=1000`).
  - Каталог-стор фронта — `src/lib/products-store.ts` (Zustand).
- ⚠️ Поиск **самого бота** — отдельный, внутри `accessories-bot.ts` (`searchAccessories`,
  ILIKE + RPC `search_accessories_trgm`), это НЕ `/api/search`.

---

## 4. Мозг бота (переиспользование)

- **Точка входа — `getAccessoriesReply(message, ctx?)`** в `src/lib/bot/accessories-bot.ts`:
  ```ts
  getAccessoriesReply(
    message: string,
    ctx?: { leadId: string|number; realId?: string|number; messageId?: string|number },
  ): Promise<BotReply>

  interface BotReply {
    text: string | null                                   // null = вне зоны / менеджеру
    photo?: { imageUrl: string; caption: string; productId: number }  // богатая карточка
  }
  ```
- **Конвейер внутри:** `classifyMessage` (Gemini → `{intent, keywords}`,
  intent ∈ `smalltalk|accessories|site_help|other`) → `searchAccessories` (Supabase
  ILIKE→trgm) → `composeAnswer` (Gemini, `SYSTEM_PROMPT` + товары + `CLIENT_FAQ`).
- **Что чистая логика (без Umnico):** `classifyMessage`, `searchAccessories`,
  `composeAnswer`, фолбэки разделов (`matchLeafByKeywords`) — всё на **Gemini
  (`src/lib/gemini.ts`) + Supabase service-role**. Umnico там **не задействован**.
- **Единственная завязка на Umnico** в `getAccessoriesReply` — импорт
  **`fetchDialogContext` из `@/lib/umnico`** (тянет историю диалога из Umnico по
  `leadId/realId`). Вызывается только если переданы `ctx.leadId` и `ctx.realId`.
- **Можно ли вызвать из нового API-роута сайта напрямую (минуя Umnico-вебхук)?** — **ДА.**
  `getAccessoriesReply(message)` **без `ctx`** → `fetchDialogContext` не дёргается
  (лог `history: 0 messages (no realId)`), классификация/поиск/compose отрабатывают
  чисто. Photo-решение (`BOT_SEND_PHOTOS`) и карточка тоже работают.
  ⚠️ **Но без `ctx` нет памяти диалога.** Для своего виджета на следующем шаге нужно
  **отрефакторить** `getAccessoriesReply`, чтобы принимать историю параметром
  (`history: DialogMessage[]`) вместо похода в Umnico — тогда история берётся из своей
  таблицы (раздел 5). `DialogMessage` уже есть: `{ role:'client'|'bot'|'manager', text }`.
- **Промпты / синонимы / FAQ — переиспользуются как есть:**
  - `SYSTEM_PROMPT`, `SMALLTALK_REPLIES`, `SMALLTALK_REPLIES_REPEAT`, `NOT_FOUND_REPLY`,
    `CATEGORY_SUGGESTION`, промпт `classifyMessage`, `GROUP_EMOJI`/`buildCardCaption`
    — все в `src/lib/bot/accessories-bot.ts`.
  - Синонимы — `src/lib/search-synonyms.ts` (`expandSearchQuery`, `formatSynonymsForPrompt`),
    общий с `/api/search`.
  - FAQ — `src/lib/bot/site-faq.ts` (`CLIENT_FAQ`), единый источник (intent=site_help).
  - Таксономия/разделы — `src/lib/category-tree.ts` (`groupIdForSubcat`, `labelForSubcat`…).
  - Каналная политика/флаги (`CHANNEL_POLICY`, `BOT_SEND_PHOTOS`) — там же; для нативного
    виджета канал `widget` уже = `auto`.

---

## 5. Хранение истории диалога

- **Сейчас история берётся из Umnico** — `fetchDialogContext(leadId, realId)` в
  `src/lib/umnico.ts` (`POST /messaging/{leadId}/history/{realId}`), роли
  `client/bot/manager`, последние ~10 сообщений.
- **Своей таблицы под сообщения/диалоги в Supabase НЕТ.** Единственное смежное —
  `bot_enabled_leads` (гейт manual-каналов, не история).
- **Предлагаемая схема (нужно создать):**
  ```sql
  -- Диалог (сессия чата). Привязка к залогиненному (profiles.id) ИЛИ к анониму (cookie/uuid).
  create table conversations (
    id          uuid primary key default gen_random_uuid(),
    client_id   uuid null references profiles(id),   -- залогиненный; null для гостя
    anon_id     text null,                            -- id анонимной сессии (cookie/localStorage)
    phone       text null,                            -- если знаем телефон
    channel     text not null default 'site_widget',
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
  );

  -- Сообщения диалога.
  create table messages (
    id              bigint generated always as identity primary key,
    conversation_id uuid not null references conversations(id) on delete cascade,
    role            text not null check (role in ('client','bot','manager','system')),
    text            text not null,
    meta            jsonb null,        -- напр. {productId, photoUrl} для карточек
    created_at      timestamptz not null default now()
  );
  create index on messages (conversation_id, created_at);
  ```
  - История для `getAccessoriesReply` = последние N `messages` диалога, маппинг в
    `DialogMessage[]` (`role`, `text`), хронологический порядок (старые→новые).
  - RLS: писать/читать через серверный роут (service-role) — как остальной бот; либо
    политика по `anon_id`/`client_id`. Гостевой диалог — `anon_id` из cookie.

---

## 6. Стек фронта

- **Next.js `16.2.3`, App Router** (`src/app/**`). **React `19.2.4`**. TypeScript 5.
- **Состояние — Zustand `5.0.12`**, всё через **модульные синглтон-сторы** (провайдеры
  не нужны): `auth-store`, `cart-store`, `products-store`, `filter-store`,
  `favorites-store`, `detail-store` (в `src/lib/`).
- **UI-кит — shadcn (`shadcn@4`) + `radix-ui` + `lucide-react`**, `class-variance-authority`,
  `tailwind-merge`, `clsx`. Готовые примитивы — `src/components/ui/*`
  (`dialog`, `sheet`, `table`…). Markdown — `marked` (есть в deps).
- **Стилизация — Tailwind CSS `v4`** (`@tailwindcss/postcss`), глобали + дизайн-токены
  в `src/app/globals.css`.
- **Глобальный лейаут — `src/app/layout.tsx`** (RootLayout): монтирует `Header`,
  `{children}`, `SiteFooter`, `MobileTabBar`, `FavoritesGate` и инлайн-скрипт Umnico.
  **Сюда же добавляется виджет, чтобы был на ВСЕХ страницах** (один компонент в `<body>`).
  Отдельных React-context-провайдеров нет.
- **Шрифты (по факту, `layout.tsx`):**
  - `Golos_Text` → `--font-golos` — **основной (body)**;
  - `Lora` → `--font-serif` — заголовки;
  - `JetBrains_Mono` → `--font-jetbrains` — моно/числа.
- **Палитра (CSS-переменные, `globals.css`):**
  `--accent #8B3A5A` (Rosewood, основной), `--accent-mid #C97A92` (Bloom),
  `--accent-light #F7EEF2`, `--fern #3D6B50` (статусы «в наличии»),
  `--text #1C1C1C`, `--text-mid #6B7570`, `--bg #ffffff`, `--bg2 #F7EEF2`,
  `--border #E8DDE5`. Радиусы скруглений мелкие: `--radius-card/btn/input = 4px`.
- Тосты — `react-hot-toast`; аналитика — `@vercel/analytics`.

---

## 7. Umnico-виджет сейчас (где снять/заменить)

- **Подключён инлайн в `src/app/layout.tsx`, строки ~55–76** — `<Script id="umnico-widget"
  strategy="afterInteractive">` с IIFE: создаёт лого/loader и грузит
  `https://umnico.com/assets/widget-loader.js`; `document.umnicoWidgetHash =
  'f3ed509085f6da0d5fb4fa5e40ec3156'`. **Это единственное живое место подключения.**
- Есть **дубль-компонент `src/components/UmnicoWidget.tsx`** (тот же скрипт через
  `useEffect`), но он **нигде не импортируется** — мёртвый код.
- **Чтобы заменить:** убрать/закомментировать блок `<Script id="umnico-widget">` в
  `layout.tsx` и смонтировать туда же свой `<AiWidget />`. Дополнительно: бот сейчас
  завязан на Umnico-вебхук `/api/webhooks/umnico` (входящие из Umnico) — для нативного
  виджета он не нужен; новый поток = свой роут `/api/widget/chat` → `getAccessoriesReply`.
  ⚠️ Снятие Umnico-виджета не трогает WhatsApp-уведомления заказов (`umnicoClient`,
  `src/lib/umnico/client.ts`) — это отдельный канал, его не трогаем.

---

## Резюме по готовности (что есть / что создать)

| Нужно для виджета | Статус |
|---|---|
| Auth-стор (кто залогинен, phone) | ✅ есть (`useAuthStore`) |
| `client_id` на фронте | ⚠️ нет; только `phone` → резолв на сервере (как `/api/checkout`) |
| Корзина + программный `add` | ✅ есть (`useCart`) |
| Каталог/товары API | ✅ есть (`/api/products`, `/api/search`, карточка `/product/[id]`) |
| Мозг бота `getAccessoriesReply` | ✅ есть; вызов напрямую возможен **без** Umnico |
| Инъекция своей истории в бота | ⚠️ нужно отрефакторить (сейчас история из Umnico) |
| Таблицы истории диалога | ❌ НЕТ — создать `conversations` + `messages` |
| Роут чата виджета `/api/widget/chat` | ❌ НЕТ — создать |
| Точка монтирования на всех страницах | ✅ есть (`layout.tsx`) |

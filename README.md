# 🌹 Flowers B2B — «Цветы Уральска»

B2B-платформа оптовой торговли цветами и расходными материалами: каталог, корзина, заказы, резервирование остатков, онлайн-оплата, предзаказы, AI-консультант.

> Старт-контекст для разработки — **[`CONTEXT_FOR_NEW_SESSION.md`](./CONTEXT_FOR_NEW_SESSION.md)**.  
> Полная техдока — **[`CLAUDE.md`](./CLAUDE.md)**. Статус — [`PROJECT_STATUS.md`](./PROJECT_STATUS.md).

## Функциональность

- 📦 **Каталог** — срезка (`cut`), горшечные (`pot`), расходка/аксессуары (`accessories`)
- 🛒 **Корзина и заказы** — оформление гостем (по телефону) или клиентом, выбор цвета
- ⏱️ **Резервирование** — 30 мин при оформлении (`reservations`)
- 📊 **Остатки** — плоская модель `products.qty`, доступность через view `stock_available`
- 💳 **Оплата** — ePay/Halyk + счета на оплату (`invoices`)
- 🎁 **Предзаказы** — закрытые комнаты-кампании OZ (вход по коду)
- 🤖 **AI-виджет** + Umnico-бот расходки, AI-перевод названий (Gemini)
- 🔗 **Интеграции** — amoCRM, Umnico/WhatsApp, Telegram, Яндекс.Метрика, 1С-импорт
- 🔐 **Auth** — телефон + PIN (Supabase Auth), роли admin/manager/client, RLS

## Стек

| Слой | Технология |
|------|------------|
| Frontend | Next.js 16 (App Router), React 19, Tailwind, Zustand |
| Backend | Next.js API Routes (`output: 'standalone'`, Node-сервер) |
| БД | Supabase (PostgreSQL + RLS), проект `jwastcmasactymmzojhi` |
| Prod | VPS hoster.kz (Node 22 + pm2 + nginx), деплой push→main через GitHub Actions |
| Preview | Vercel (`flowers-b2b-phi`) — авто-деплой с `main` **отключён** |
| Язык | TypeScript |

## Быстрый старт

```bash
git clone https://github.com/cvety-uralska/flowers-b2b.git
cd flowers-b2b
npm install
npm run dev          # http://localhost:3000
```

`.env.local`:
```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...      # нужен большинству серверных роутов (работает и на проде)
CRON_SECRET=...                       # защита /api/cron/*
# AI/интеграции — см. CLAUDE.md → Environment Variables
```

## Сборка и деплой

```bash
npm run build
npm run start
```

- **Prod:** push в `main` → GitHub Actions (`.github/workflows/deploy-vps.yml`) собирает и деплоит на VPS (`pm2 reload`). См. [`docs/INFRA.md`](./docs/INFRA.md).
- **Preview:** Vercel-проект `flowers-b2b-phi` (стейджинг).
- ⚠️ `SUPABASE_SERVICE_ROLE_KEY` **используется** в десятках API-роутов и работает на проде (старое утверждение об обратном устарело).

## Архитектура (кратко)

- **Остатки** — плоская схема: остаток в `products.qty`, цена в `products.price`. Таблиц `batches`/`stock` нет. Резерв — `reservations` (30 мин), доступность — view `stock_available`.
- **Доступ к БД** — `createAdminClient()` (service-role, обходит RLS) для серверных роутов; `createClient()` (anon + RLS) для read-роутов витрины; часть admin-операций через SECURITY DEFINER RPC.
- **Auth** — email `{цифры_телефона}@flowers.local` + PIN (Supabase Auth).

Подробности — [`CONTEXT_FOR_NEW_SESSION.md`](./CONTEXT_FOR_NEW_SESSION.md) и [`CLAUDE.md`](./CLAUDE.md).

## Роли

| Роль | Права |
|------|-------|
| admin | Полный доступ, импорт, управление товарами |
| manager | Остатки, подтверждение/сборка заказов |
| client | Каталог, свои заказы |

## Документация

- [`CLAUDE.md`](./CLAUDE.md) — полная техдока
- [`CONTEXT_FOR_NEW_SESSION.md`](./CONTEXT_FOR_NEW_SESSION.md) — старт-контекст
- [`PROJECT_STATUS.md`](./PROJECT_STATUS.md) — статус, known issues, roadmap
- [`DOCS_AUDIT_REPORT.md`](./DOCS_AUDIT_REPORT.md) — аудит доков vs реальность
- `docs/` — INFRA, PAYMENTS, STOCK_MANAGEMENT, IMPORT_SYSTEM, AI_TRANSLATOR, UMNICO_BOT, WIDGET_TECH_CONTEXT, OZ_*, SECURITY-RLS-PLAN и др.

## Контакты

- **Email:** opt.uralsk@gmail.com
- **Тел:** +7 700 757 5243
</content>

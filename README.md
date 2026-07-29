# 🌹 Flowers B2B — Оптовый склад цветов

[![Deploy](https://img.shields.io/badge/Vercel-Deployed-brightgreen)](https://flowers-b2b.vercel.app)
[![License](https://img.shields.io/badge/License-MIT-blue)](#)

Современная B2B платформа для оптовой торговли цветами. Система управления каталогом товаров, заказами, резервированием остатков и отгрузкой.

## 🎯 Функциональность

- 📦 **Каталог товаров** — розы, гвоздики и другие цветы по сортам
- 🛒 **Корзина и заказы** — добавление товаров без предварительного входа, быстрый checkout по телефону
- ⏱️ **Резервирование** — 30-минутное резервирование после создания заказа на checkout
- 📊 **Управление остатками** — отслеживание доступного количества в реальном времени
- 👥 **Профили клиентов** — история заказов, профиль компании
- 🔐 **Безопасность** — RLS политики в Supabase, аутентификация через Supabase Auth
- 📱 **Уведомления** — интеграция с WhatsApp

## 🛠️ Стек технологий

| Компонент | Технология |
|-----------|------------|
| **Frontend** | Next.js 16, React, Tailwind CSS, Zustand |
| **Backend** | Next.js API Routes (serverless) |
| **База данных** | Supabase (PostgreSQL) |
| **Аутентификация** | Supabase Auth |
| **Хостинг** | Vercel |
| **Язык** | TypeScript |

## 📋 Структура проекта

```
src/
├── app/
│   ├── api/                    # API маршруты
│   │   ├── checkout/          # Создание заказов
│   │   ├── cancel-order/      # Отмена заказов
│   │   ├── confirm-order/     # Подтверждение заказов
│   │   ├── products/          # Каталог товаров
│   │   ├── my-orders/         # Мои заказы
│   │   └── ...
│   └── (pages)/               # Страницы приложения
├── components/                # React компоненты
├── lib/
│   ├── supabase/             # Клиент Supabase
│   └── hooks/                # Custom React hooks
├── types/                     # TypeScript типы
└── store/                     # Zustand глобальное состояние
```

## 🚀 Быстрый старт

### Требования
- Node.js 18+
- npm или yarn
- Supabase проект

### Установка

1. **Клонируй репозиторий**
```bash
git clone https://github.com/cvety-uralska/flowers-b2b.git
cd flowers-b2b
```

2. **Установи зависимости**
```bash
npm install
```

3. **Настрой переменные окружения**

Создай `.env.local`:
```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...  # для локальных тестов
```

4. **Запусти dev сервер**
```bash
npm run dev
```

Приложение будет доступно на `http://localhost:3000`

## 📦 Сборка и деплой

### Локальная сборка
```bash
npm run build
npm run start
```

### Деплой на Vercel

Репозиторий автоматически связан с Vercel. При push на `main` начинается деплой:

```bash
git push origin main
```

⚠️ **Важно**: В Vercel Settings добавь только:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

НЕ добавляй `SUPABASE_SERVICE_ROLE_KEY` (не работает в serverless)

## 📚 API Документация

### Основные маршруты

| Маршрут | Метод | Описание |
|---------|-------|---------|
| `/api/products` | GET | Получить каталог товаров |
| `/api/checkout` | POST | Создать/найти клиента по телефону, создать заказ и резервирование |
| `/api/cancel-order` | POST | Отменить заказ |
| `/api/confirm-order` | POST | Подтвердить заказ |
| `/api/update-order-qty` | POST | Изменить количество в заказе |
| `/api/my-orders` | GET | Получить мои заказы |

Подробная документация в [`CLAUDE.md`](./CLAUDE.md)

## 🔐 Архитектура безопасности

- **Аутентификация**: Supabase Auth (email/password)
- **Авторизация**: RLS (Row Level Security) на уровне БД
- **Роли**: admin, manager, client
- **Client-side**: Используется `createClient()` (client role) + RLS политики
- ⚠️ Service role key НЕ используется на production (не работает на Vercel)

## 🐛 Known Issues

- ⚠️ [SUPABASE_SERVICE_ROLE_KEY не работает в Vercel serverless](./CLAUDE.md#-supabase_service_role_key-не-работает-в-vercel-serverless)
- ⚠️ [Realtime обновления каталога не работают](./CLAUDE.md#-realtime-обновления-каталога-не-работают-pricetable)
- ⚠️ [WhatsApp уведомление требует разрешение всплывающих окон](./CLAUDE.md#-whatsapp-уведомление-открывается-только-с-разрешением-всплывающих-окон)

## 👤 Роли и доступ

| Роль | Права |
|------|-------|
| **admin** | Полный доступ, управление товарами, импорт из Excel |
| **manager** | Управление остатками, подтверждение заказов |
| **client** | Просмотр каталога, создание и управление своими заказами |

## 📖 Документация

- [`CLAUDE.md`](./CLAUDE.md) — полная техническая документация для разработчиков
- [`AGENTS.md`](./AGENTS.md) — информация о Next.js версии и особенности

## 🤝 Контрибьюция

1. Создай ветку для фичи: `git checkout -b feature/amazing-feature`
2. Коммитни изменения: `git commit -m 'Add amazing feature'`
3. Запушь в репозиторий: `git push origin feature/amazing-feature`
4. Открой Pull Request

## 📧 Контакты

- **Email**: opt.uralsk@gmail.com
- **GitHub**: [@cvety-uralska](https://github.com/cvety-uralska)

## 📄 Лицензия

Проект под лицензией MIT. Подробнее см. [`LICENSE`](./LICENSE)

---

Сделано с ❤️ для оптовых продавцов цветов

<!-- OLD NEXTJS TEMPLATE BELOW -->
[Next.js](https://nextjs.org project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

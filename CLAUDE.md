# Flowers B2B — Оптовый склад цветов

## Описание проекта

B2B платформа для оптовой торговли цветами. Система управления товарами, заказами, резервированием остатков и подтверждением отгрузки.

## Стек технологий

- **Frontend**: Next.js 16, React, Tailwind CSS, Zustand (состояние)
- **Backend**: Next.js API Routes (serverless functions на Vercel)
- **База данных**: Supabase (PostgreSQL + RLS)
- **Хостинг**: Vercel
- **Аутентификация**: Supabase Auth

## Структура базы данных

### Основные таблицы

- **products** — каталог товаров (розы, гвоздики и т.д.)
- **varieties** — сорта товаров (Red Naomi, Freedom и т.д.)
- **batches** — партии товара с датой поступления
- **stock** — текущие остатки по товарам
- **stock_available** — представление (view) доступного количества с учётом активных резервирований
- **orders** — заказы клиентов (статусы: pending → reserved → confirmed → cancelled)
- **order_items** — товары в заказе
- **reservations** — временные резервирования остатков (время истечения 30 мин)
- **clients** — профили клиентов
- **profiles** — дополнительные данные пользователей (роль, компания)

## Логика резервирования

1. **POST /api/checkout** — клиент добавляет товары в корзину
   - Проверяет доступное количество (stock минус активные резервирования других клиентов)
   - Создаёт или обновляет заказ со статусом `pending`
   - Создаёт резервирование на 30 минут
   - Возвращает `order_id` и `expires_at`

2. **POST /api/cancel-order** — отмена заказа
   - Меняет статус на `cancelled`
   - Удаляет связанные резервирования (возвращает остатки в доступность)
   - Пересчитывает остатки

3. **Триггер trg_confirm_order** — при смене статуса на `confirmed`
   - Списывает остатки из `stock` на основе `order_items`
   - Удаляет резервирования
   - Логирует историю отгрузки

## Критические замечания

⚠️ **SUPABASE_SERVICE_ROLE_KEY не работает в serverless на Vercel** 
- Причина: функции запускаются с разными контекстами, переменные окружения могут быть недоступны
- **Решение**: Используется обычный `createClient()` (client role) + RLS политики для ограничения доступа
- Все мутации (INSERT, UPDATE, DELETE) должны работать через RLS без обхода с service role
- Если нужны privileged операции — использовать Auth с ролями через profiles.role

## API Маршруты

| Маршрут | Метод | Описание |
|---------|-------|---------|
| `/api/products` | GET | Получить каталог товаров с фото и сортами |
| `/api/checkout` | POST | Создать заказ и резервирование |
| `/api/cancel-order` | POST | Отменить заказ (меняет статус, удаляет резервирования) |
| `/api/confirm-order` | POST | Подтвердить заказ (запускает триггер списания остатков) |
| `/api/update-order-qty` | POST | Изменить количество товара в заказе |
| `/api/my-orders` | GET | Получить заказы текущего клиента |
| `/api/import-xls` | POST | Импорт товаров из Excel (только администраторы) |
| `/api/reserve` | POST | Создать резервирование товара |
| `/api/cron/cleanup` | GET | Cron: удаляет истекшие резервирования каждые 5 минут (защита CRON_SECRET) |

## Роли и доступ

- **admin** — полный доступ ко всем данным, импорт товаров
- **manager** — управление остатками, подтверждение заказов
- **client** — просмотр каталога, создание и управление своими заказами

Роли хранятся в таблице `profiles.role` и проверяются через RLS политики.

## Важные файлы и папки

```
src/
├── app/
│   ├── api/              # API маршруты
│   └── (pages)/          # Страницы приложения
├── components/           # React компоненты
├── lib/
│   ├── supabase/
│   │   └── server.ts     # Инициализация клиента Supabase
│   └── hooks/            # Custom React hooks
├── types/                # TypeScript типы
└── store/                # Zustand стор для состояния
```

## Environment Variables

### Обязательные переменные

| Переменная | Описание | Где использовать |
|------------|---------|------------------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL Supabase проекта | Браузер + Backend |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public (anon) key для Supabase | Браузер + Backend |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (не использовать на Vercel!) | Только локальная разработка |
| `CRON_SECRET` | Секретный ключ для защиты cron endpoints | Vercel (только для cron задач) |

### Конфигурация

**.env.local** (локальная разработка):
```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...  # только для локальных тестов
CRON_SECRET=your-secret-key-here      # для тестирования cron endpoints
```

**Vercel Settings** (production):
- Добавить `NEXT_PUBLIC_SUPABASE_URL` и `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Добавить `CRON_SECRET` (сгенерировать случайную строку для безопасности)
- ⚠️ НЕ добавлять `SUPABASE_SERVICE_ROLE_KEY` (не работает в serverless)

## Known Issues

### 🔴 SUPABASE_SERVICE_ROLE_KEY не работает в Vercel serverless
- **Проблема**: Service role key не доступен в функциях на Vercel
- **Решение**: Используется `createClient()` (client role) + RLS политики
- **Статус**: Постоянное ограничение архитектуры Vercel

### 🟡 Realtime обновления каталога не работают (PriceTable)
- **Проблема**: Изменения цен в реальном времени не отражаются на фронтенде
- **Причина**: Supabase Realtime требует explicit подписки на события
- **Временное решение**: Пользователь должен перезагрузить страницу для обновления цен
- **TODO**: Добавить WebSocket слушатель на изменения products и stock

### 🟡 WhatsApp уведомление открывается только с разрешением всплывающих окон
- **Проблема**: При отправке WhatsApp уведомления ссылка не открывается, если отключены popup'ы
- **Причина**: Используется `window.open()` для перенаправления на WhatsApp Web
- **Решение для пользователя**: Разрешить всплывающие окна для сайта в настройках браузера
- **TODO**: Рассмотреть альтернативный способ (redirect вместо popup, или QR код)

## Локальная разработка

```bash
# Переменные окружения (.env.local)
NEXT_PUBLIC_SUPABASE_URL=<url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<используется только локально, не на Vercel>

# Запуск
npm install
npm run dev

# Сборка для production
npm run build
```

## Развёртывание

- **Репозиторий**: GitHub (связан с Vercel)
- **Deploy**: При push на main — автоматический деплой в Vercel
- **База данных**: Supabase (тот же проект для prod и dev)
- **Переменные окружения**: Хранятся в Vercel Settings (без service role key)

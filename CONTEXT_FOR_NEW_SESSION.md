# CONTEXT_FOR_NEW_SESSION.md — Flowers B2B

Этот файл — быстрый контекст для начала новой сессии с Claude Code.

## Проект

B2B платформа для оптовой торговли цветами. Клиенты (оптовики) заходят, смотрят каталог, добавляют товары в корзину, оформляют заказ. Менеджер получает уведомление в Telegram и подтверждает отгрузку.

- **Стек**: Next.js 16, Supabase (PostgreSQL + RLS), Vercel, Tailwind CSS, Zustand
- **Репозиторий**: GitHub → автодеплой на Vercel при push в main
- **База данных**: Supabase (один проект для prod и dev)

## Текущее состояние (на 30 апреля 2026)

### Что работает
- Каталог товаров с фото и сортами
- Корзина и оформление заказа без регистрации (по телефону)
- Данные клиента сохраняются в таблице `clients` (phone, name)
- Резервирование остатков на 30 мин, cron-очистка каждые 5 мин
- Подтверждение и отмена заказов
- Telegram уведомление менеджеру при новом заказе
- WhatsApp кнопка (открывается по клику, не автоматически)

### Что сломано / нужно сделать
1. **Импорт XLS** — qty суммируется вместо замены, новые позиции не создаются
2. **Фотографии** — нестабильное сохранение image_url
3. Личный кабинет клиента
4. WhatsApp OTP через Umnico
5. Telegram бот — ответы по остаткам
6. Дизайн — брендбук + макеты

## Архитектурные особенности (важно!)

- `SUPABASE_SERVICE_ROLE_KEY` **не работает** на Vercel serverless — используется только `createClient()` (anon role) + RLS
- Все мутации идут через RLS политики, не через service role
- Клиенты создаются без Supabase Auth аккаунта — у `clients.id` есть `DEFAULT gen_random_uuid()`, FK constraint на auth.users убран

## Ключевые файлы

```
src/
├── app/
│   ├── api/
│   │   ├── checkout/route.ts       # Создание заказа + резервирование
│   │   ├── cancel-order/route.ts   # Отмена заказа
│   │   ├── confirm-order/route.ts  # Подтверждение отгрузки
│   │   ├── products/route.ts       # Каталог товаров
│   │   ├── import-xls/route.ts     # Импорт из Excel (баг с qty)
│   │   └── cron/cleanup/route.ts   # Очистка истёкших резервирований
│   └── (pages)/
├── components/                     # React компоненты
├── lib/supabase/server.ts          # Инициализация Supabase клиента
└── store/                          # Zustand стор (корзина, состояние)
```

## Таблицы БД

| Таблица | Назначение |
|---------|-----------|
| `products` | Каталог товаров |
| `varieties` | Сорта товаров |
| `batches` | Партии с датой поступления |
| `stock` | Текущие остатки |
| `stock_available` | View: остатки минус активные резервирования |
| `orders` | Заказы (pending → reserved → confirmed → cancelled) |
| `order_items` | Товары в заказе |
| `reservations` | Временные резервирования (30 мин) |
| `clients` | Профили клиентов (phone, name, без auth) |
| `profiles` | Роли пользователей (admin / manager / client) |

## Переменные окружения

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
# SUPABASE_SERVICE_ROLE_KEY — только локально, НЕ на Vercel
CRON_SECRET=...   # для защиты /api/cron/cleanup
```

# CONTEXT_FOR_NEW_SESSION.md — Flowers B2B

Этот файл — быстрый контекст для начала новой сессии с Claude Code.

## Проект

B2B платформа для оптовой торговли цветами. Клиенты (оптовики) заходят, смотрят каталог, добавляют товары в корзину, оформляют заказ. Менеджер получает уведомление в Telegram и подтверждает отгрузку.

- **Стек**: Next.js 16, Supabase (PostgreSQL + RLS), Vercel, Tailwind CSS, Zustand
- **Репозиторий**: GitHub → автодеплой на Vercel при push в main
- **База данных**: Supabase (один проект для prod и dev)

## Текущее состояние (на 1 мая 2026)

### Что работает
- Каталог товаров с фото, сортами, бейджем «Уценка» при снижении цены
- Корзина и оформление заказа без регистрации (по телефону)
- Данные клиента сохраняются в таблице `clients` (phone, name)
- Резервирование остатков на 30 мин, cron-очистка каждые 5 мин
- Подтверждение и отмена заказов
- Страница кассира (`/admin` → CashierView) — планшетный UI
- Быстрый заказ от менеджера (NewOrderModal с поиском товаров)
- Печать накладной `/print/order/[id]`
- Экспорт выданных заказов в Excel
- Telegram уведомление менеджеру при новом заказе
- WhatsApp кнопка (открывается по клику, не автоматически)
- Авторизация: телефон + PIN через Supabase Auth
- Импорт XLS работает (суммирование qty починено)

### Что нужно сделать
1. **Редизайн фаза 2** — применить CSS-токены ко всем страницам
2. **Фотографии** — нестабильное сохранение image_url
3. WhatsApp OTP через Umnico
4. Telegram бот — ответы по остаткам
5. Realtime обновления каталога (WebSocket)

## Архитектурные особенности (важно!)

- `SUPABASE_SERVICE_ROLE_KEY` **не работает** на Vercel serverless — используется только `createClient()` (anon role) + RLS
- Все мутации идут через RLS политики, не через service role
- Клиенты создаются без Supabase Auth аккаунта — у `clients.id` есть `DEFAULT gen_random_uuid()`, FK constraint на auth.users убран

## Ключевые файлы

```
src/
├── app/
│   ├── api/
│   │   ├── checkout/route.ts         # Создание заказа + резервирование
│   │   ├── cancel-order/route.ts     # Отмена заказа
│   │   ├── confirm-order/route.ts    # Подтверждение отгрузки
│   │   ├── manager-order/route.ts    # Быстрый заказ от менеджера
│   │   ├── search-products/route.ts  # Поиск товаров (для NewOrderModal)
│   │   ├── export-orders/route.ts    # Экспорт выданных заказов в Excel
│   │   ├── products/route.ts         # Каталог товаров
│   │   ├── import-xls/route.ts       # Импорт из Excel
│   │   └── cron/cleanup/route.ts     # Очистка истёкших резервирований
│   ├── print/order/[id]/page.tsx     # Накладная для печати
│   └── (pages)/
├── components/
│   ├── admin/
│   │   ├── OrdersPanel.tsx           # Список заказов с кнопками статусов
│   │   ├── NewOrderModal.tsx         # Быстрый заказ менеджера
│   │   └── CashierView.tsx           # Кассовый планшетный интерфейс
│   └── catalog/
├── lib/supabase/server.ts            # Инициализация Supabase клиента
└── store/                            # Zustand стор (корзина, состояние)
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

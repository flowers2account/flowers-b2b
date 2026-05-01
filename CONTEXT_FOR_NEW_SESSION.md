# CONTEXT_FOR_NEW_SESSION.md — Flowers B2B

Этот файл — быстрый контекст для начала новой сессии с Claude Code.

## Проект

B2B платформа для оптовой торговли цветами. Клиенты (оптовики) заходят, смотрят каталог, добавляют товары в корзину, оформляют заказ. Менеджер получает уведомление в Telegram и подтверждает отгрузку.

- **Стек**: Next.js 16, Supabase (PostgreSQL + RLS), Vercel, Tailwind CSS, Zustand
- **Репозиторий**: GitHub → автодеплой на Vercel при push в main
- **База данных**: Supabase (один проект для prod и dev)

## Текущее состояние (на 2 мая 2026)

### Что работает
- Двухуровневый хедер: L1 белый (логотип, навигация, авторизация) + L2 бордовый (категории, корзина)
- Каталог — три колонки: FilterSidebar слева, сетка ProductCard по центру, CartSidebar справа
- Фильтры: поиск, категория, наличие/уценка через Zustand filter-store
- Карточки товаров: фото, бейдж остатка, цена (зачёркнутая при уценке), кнопки с шагом pack_size
- Корзина и оформление заказа без регистрации (по телефону)
- Резервирование остатков на 30 мин, cron-очистка каждые 5 мин
- Подтверждение и отмена заказов
- Страница кассира (`/admin` → CashierView) — планшетный UI
- Быстрый заказ от менеджера (NewOrderModal с поиском товаров)
- Печать накладной `/print/order/[id]`
- Экспорт выданных заказов в Excel
- Telegram уведомление менеджеру при новом заказе
- Авторизация: телефон + PIN через Supabase Auth
- Импорт XLS работает

### Что нужно сделать
1. **Загрузить реальных клиентов** — Supabase Auth аккаунты + profiles
2. **Форма управления клиентами** в /admin
3. **Редизайн фаза 4** — стили /admin и /cabinet
4. **Фотографии** — нестабильное сохранение image_url
5. WhatsApp OTP через Umnico
6. Realtime обновления каталога (WebSocket)
7. Мобильная адаптация (FilterSidebar → drawer)

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
│       ├── Header.tsx                # Двухуровневый хедер (L1 белый + L2 #8B1A1A)
│       ├── FilterSidebar.tsx         # Левый сайдбар фильтров
│       ├── ProductCard.tsx           # Карточка товара для сетки
│       ├── PriceTable.tsx            # Сетка карточек + фильтрация
│       └── CartSidebar.tsx           # Правый сайдбар корзины + оформление
├── lib/
│   ├── filter-store.ts               # Zustand стор фильтров каталога
│   ├── cart-store.ts                 # Zustand стор корзины
│   ├── auth-store.ts                 # Zustand стор авторизации
│   └── supabase/server.ts            # Инициализация Supabase клиента
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

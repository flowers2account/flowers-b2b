# ARCHITECTURE.md — Архитектура проекта

> Актуально на: 24 мая 2026

---

## Стек

| Слой | Технология |
|------|-----------|
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS |
| State | Zustand (6 сторов) |
| Backend | Next.js API Routes (serverless, деплой на Vercel) |
| База данных | Supabase (PostgreSQL 16) |
| Auth | Supabase Auth (телефон+PIN через signInWithPassword) |
| Хостинг | Vercel (auto-deploy от push в main) |
| XLS парсинг | `xlsx` (SheetJS) |
| UI компоненты | shadcn/ui, lucide-react |
| Drag & Drop | dnd-kit |
| Даты | date-fns |
| QR | qrcode |
| Мессенджер | Umnico (WhatsApp/Telegram) |
| AI | Google Gemini (через `@google/generative-ai`) |

---

## Структура папок

```
flowers-b2b/
├── src/
│   ├── app/
│   │   ├── page.tsx              # Каталог (главная)
│   │   ├── admin/                # Панель администратора
│   │   │   └── page.tsx
│   │   ├── cabinet/              # Личный кабинет клиента
│   │   │   └── page.tsx
│   │   └── api/                  # API маршруты (см. ниже)
│   ├── components/
│   │   ├── admin/                # Компоненты панели админа
│   │   ├── catalog/              # Каталог и фильтры
│   │   ├── cashier/              # Компоненты кассира
│   │   └── ui/                   # shadcn/ui компоненты
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts         # Singleton Supabase (браузер)
│   │   │   ├── server.ts         # Supabase client (API routes)
│   │   │   └── admin.ts          # Supabase с service role (только локально)
│   │   ├── auth-store.ts         # Zustand: user, role, phone, isAuthed
│   │   ├── cart-store.ts         # Zustand: CartItem[]
│   │   ├── detail-store.ts       # Zustand: панель (empty|detail|cart), flashCart
│   │   ├── products-store.ts     # Zustand: products[], filteredCount
│   │   ├── filter-store.ts       # Zustand: все фильтры каталога
│   │   ├── store/settingsStore.ts# Zustand: настройки (уведомления и т.д.)
│   │   ├── parse-nomenclature.ts # Парсинг названия из 1С → {variety_name, length_cm...}
│   │   ├── colors.ts             # Палитра COLORS — единственный источник
│   │   ├── phone.ts              # normalizePhone() → +7XXXXXXXXXX
│   │   ├── filter-chips.ts       # useFilterChips() — активные чипы фильтров
│   │   ├── use-mobile.ts         # useIsMobile() — breakpoint < 768px
│   │   ├── card-generator.ts     # Генерация PDF карточек товаров
│   │   ├── naming/
│   │   │   ├── parse-invoice.ts  # Парсинг инвойса Голландии
│   │   │   ├── ai-normalizer.ts  # AI нормализация через Gemini
│   │   │   ├── supplier-translations.ts
│   │   │   └── types.ts
│   │   ├── umnico/
│   │   │   ├── client.ts         # Umnico API client
│   │   │   └── templates.ts      # Шаблоны сообщений
│   │   └── utils/
│   │       └── normalize-text.ts
│   └── types/                    # TypeScript типы
├── docs/                         # База знаний (этот файл и другие)
├── CLAUDE.md                     # Инструкции для AI ассистента
└── PROJECT_STATUS.md             # История изменений
```

---

## API Маршруты

### Аутентификация
| Маршрут | Метод | Описание |
|---------|-------|---------|
| `/api/auth/send-pin` | POST | Отправка PIN по телефону (SMS/WhatsApp) |
| `/api/auth/verify-pin` | POST | Проверка PIN, вход |
| `/api/auth/phone` | POST | Auth через телефон |
| `/api/auth/register` | POST | Регистрация нового клиента |
| `/api/whatsapp/send-pin` | POST | Отправка PIN через WhatsApp |

### Каталог и поиск
| Маршрут | Метод | Описание |
|---------|-------|---------|
| `/api/products` | GET | Каталог с фото, сортами, остатками |
| `/api/search-products` | GET | Поиск с expand_search_query + pg_trgm |
| `/api/facets` | GET | Фасеты для фильтров каталога |
| `/api/cashier/products` | GET | Продукты для кассира |

### Заказы
| Маршрут | Метод | Описание |
|---------|-------|---------|
| `/api/checkout` | POST | Создание заказа + резервирование |
| `/api/orders/[id]` | GET/PATCH | Получение/изменение заказа |
| `/api/orders/[id]/assemble` | POST | Сборка заказа (assembling→assembled) |
| `/api/orders/[id]/history` | GET | История статусов заказа |
| `/api/my-orders` | GET | Заказы текущего клиента |
| `/api/manager-order` | POST | Создание заказа менеджером |
| `/api/export-orders` | GET | Экспорт заказов в Excel |

### Импорт и остатки
| Маршрут | Метод | Описание |
|---------|-------|---------|
| `/api/import-xls` | POST | Импорт XLS из 1С → sync_stock_from_1c |
| `/api/writeoffs` | POST/GET | Списания товара |
| `/api/inventory/sessions` | GET/POST | Сессии инвентаризации |
| `/api/inventory/sessions/[id]` | GET/PATCH | Управление сессией |
| `/api/inventory/add-count` | POST | Добавление подсчёта |

### Кампании (предзаказы)
| Маршрут | Метод | Описание |
|---------|-------|---------|
| `/api/campaigns` | GET/POST | Список/создание кампаний |
| `/api/campaigns/[id]` | GET/PATCH | Управление кампанией |
| `/api/campaigns/[id]/order` | POST | Создание предзаказа в кампании |
| `/api/campaigns/[id]/convert` | POST | Конвертация предзаказов → заказы |
| `/api/campaigns/[id]/summary` | GET | Сводка по кампании |
| `/api/campaigns/orders` | GET | Все предзаказы |

### Клиенты и профили
| Маршрут | Метод | Описание |
|---------|-------|---------|
| `/api/admin/clients` | GET/POST | Управление клиентами |
| `/api/admin/clients/import` | POST | Импорт клиентов из файла |
| `/api/admin/staff` | GET/POST | Управление сотрудниками |
| `/api/admin/products` | GET/PATCH | Управление товарами (admin) |
| `/api/client/update-profile` | POST | Обновление профиля клиента |
| `/api/client/change-pin` | POST | Смена PIN |
| `/api/cabinet` | GET | Данные личного кабинета |

### AI и переводы
| Маршрут | Метод | Описание |
|---------|-------|---------|
| `/api/translations/normalize` | POST | Нормализация названия через AI |
| `/api/translations/batch` | POST | Пакетный перевод накладной |
| `/api/test-gemini` | POST | Тест Gemini API |

### Уведомления и интеграции
| Маршрут | Метод | Описание |
|---------|-------|---------|
| `/api/settings/notifications` | GET/POST | Настройки уведомлений |
| `/api/telegram/notify-writeoff` | POST | Telegram уведомление о списании |
| `/api/whatsapp-bot` | POST | Webhook WhatsApp бота |

### Cron
| Маршрут | Метод | Описание |
|---------|-------|---------|
| `/api/cron/cleanup` | GET | Удаляет истёкшие резервы (защита CRON_SECRET) |

---

## Zustand сторы

### `auth-store.ts` — `useAuthStore`
```typescript
{
  user: User | null,
  role: 'admin' | 'manager' | 'client' | null,
  phone: string | null,
  isAuthed: boolean,
  _initialized: boolean,  // singleton guard
  // actions: setUser, signOut, initialize
}
```
- Синглтон с флагом `_initialized`
- Защита роутов `/admin` и `/cabinet` — только на клиенте
- Серверные проверки auth убраны; `userId` передаётся в теле запроса

### `cart-store.ts` — `useCartStore`
```typescript
CartItem { id, name, price, qty, available, category, image_url }
```

### `detail-store.ts` — `useDetailStore`
```typescript
{
  panel: 'empty' | 'detail' | 'cart',
  product: Product | null,
  flashCart: boolean,
}
```

### `products-store.ts` — `useProductsStore`
```typescript
{ products: Product[], filteredCount: number }
```

### `filter-store.ts` — `useFilterStore`
Все фильтры каталога: category, origin, length, priceMin/Max, search, sortBy...

### `store/settingsStore.ts` — `useSettingsStore`
Настройки уведомлений и системных параметров.

---

## Ключевые модули

### `src/lib/parse-nomenclature.ts`
Парсит raw name из 1С → структурированные данные:
```typescript
{
  variety_name: string,
  length_cm: number | null,
  length_str: string | null,
  category: 'cut' | 'pot',
  origin: string | null,
}
```
Используется в `/api/import-xls`.

### `src/lib/naming/parse-invoice.ts`
Парсит инвойс Голландии (формат 7flowers) → массив позиций с полями цвета, страны, длины.

### `src/lib/naming/ai-normalizer.ts`
Нормализация названия через Gemini API + translation_memory как контекст.

### `src/lib/phone.ts` — `normalizePhone()`
Единая нормализация: `+77476108458`. Email для Supabase Auth: `{digits}@flowers.local`.

### `src/lib/colors.ts` — `COLORS`
Единый источник палитры цветов. Импортировать только отсюда.

---

## Компоненты каталога

> `ProductCard.tsx` используется только в `PriceTable.tsx`.  
> Основной каталог: `GridCard` внутри `ProductGrid.tsx` — правки карточек делать там.

### Ключевые компоненты
| Компонент | Назначение |
|-----------|-----------|
| `ProductGrid.tsx` | Основная сетка каталога с `GridCard` |
| `PriceTable.tsx` | Табличный вид с `ProductCard` |
| `AuthModal.tsx` | Вход: телефон + PIN |
| `ImportXLS.tsx` | Форма загрузки XLS (admin) |
| `DetailPanel.tsx` | Правая панель: детали товара / корзина |

---

## Переменные окружения

| Переменная | Где используется |
|-----------|-----------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Браузер + API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Браузер + API |
| `SUPABASE_SERVICE_ROLE_KEY` | Только локально (`admin.ts`) |
| `CRON_SECRET` | Защита `/api/cron/cleanup` |
| `GOOGLE_AI_API_KEY` | Gemini AI (translations) |

⚠️ `SUPABASE_SERVICE_ROLE_KEY` не работает в Vercel serverless — не добавлять в production.

---

## Деплой

```
GitHub main branch
    └──► Vercel (auto-deploy)
              └──► Supabase (один проект для prod и dev)
```

Нет staging окружения. Все изменения БД идут напрямую в prod.

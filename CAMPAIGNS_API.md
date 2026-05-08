# API Documentation — Campaigns (Предзаказы)

## Endpoints

### 1. GET /api/campaigns
Получить список всех кампаний

**Query Parameters:**
- `status` (optional): `draft` | `published` | `closed` | `delivered` | `cancelled`
- `type` (optional): `europe` | `china`

**Response:**
```json
{
  "campaigns": [
    {
      "id": 1,
      "title": "Голландия 15 мая",
      "type": "europe",
      "description": "Премиум срезка из Голландии",
      "closes_at": "2026-05-15T18:00:00+05:00",
      "delivery_date": "2026-05-20",
      "status": "published",
      "allowed_price_groups": ["vip", "wholesale"],
      "created_at": "2026-05-08T05:00:00Z",
      "updated_at": "2026-05-08T05:00:00Z",
      "stats": {
        "total_items": 5,
        "total_orders": 12,
        "total_clients": 8,
        "total_amount": 125000,
        "status": "published",
        "closes_in_hours": 168.5
      },
      "items_count": 5
    }
  ],
  "user_id": "uuid-string-or-null"
}
```

**Access:** Public (но draft/closed видят только admin/manager)

---

### 2. POST /api/campaigns
Создать новую кампанию

**Request Body:**
```json
{
  "title": "Голландия 20 мая",
  "type": "europe",
  "description": "Розы, тюльпаны премиум качества",
  "closes_at": "2026-05-15T18:00:00+05:00",
  "delivery_date": "2026-05-20",
  "allowed_price_groups": ["vip", "wholesale"],
  "items": [
    {
      "product_id": 123,
      "price": 250.00,
      "min_qty": 10,
      "pack_size": 10,
      "notes": "Только оптом"
    }
  ]
}
```

**Response:**
```json
{
  "campaign": {
    "id": 1,
    "title": "Голландия 20 мая",
    "status": "draft",
    ...
  },
  "message": "Campaign created successfully"
}
```

**Access:** Admin / Manager only

---

### 3. GET /api/campaigns/[id]
Получить детали кампании с позициями

**Response:**
```json
{
  "campaign": {
    "id": 1,
    "title": "Голландия 15 мая",
    ...
  },
  "items": [
    {
      "id": 1,
      "campaign_id": 1,
      "product_id": 123,
      "price": 250.00,
      "min_qty": 10,
      "pack_size": 10,
      "sort_order": 0,
      "product": {
        "id": 123,
        "name": "Роза Red Naomi 60см",
        "variety_name": "Red Naomi",
        "length_str": "60",
        "image_url": "https://...",
        "category": "cut",
        "color": "red",
        "origin": "holland"
      }
    }
  ],
  "stats": {
    "total_items": 5,
    "total_orders": 12,
    "total_clients": 8,
    "total_amount": 125000,
    "closes_in_hours": 168.5
  },
  "my_order": {
    "id": 15,
    "status": "pending",
    "total": 5000,
    "items": [
      {
        "id": 25,
        "campaign_item_id": 1,
        "qty": 20,
        "price": 250.00,
        "campaign_item": { ... }
      }
    ]
  },
  "user_id": "uuid-or-null"
}
```

**Access:** Public для published кампаний

---

### 4. PATCH /api/campaigns/[id]
Обновить кампанию

**Request Body:**
```json
{
  "title": "Новое название",
  "status": "published",
  "description": "Обновлённое описание"
}
```

**Access:** Admin / Manager only

---

### 5. DELETE /api/campaigns/[id]
Удалить кампанию

**Response:**
```json
{
  "message": "Campaign deleted successfully"
}
```

**Access:** Admin only

---

### 6. POST /api/campaigns/[id]/order
Создать или обновить предзаказ

**Request Body (авторизованный пользователь):**
```json
{
  "items": [
    {
      "campaign_item_id": 1,
      "qty": 20
    },
    {
      "campaign_item_id": 2,
      "qty": 50
    }
  ]
}
```

**Request Body (гость):**
```json
{
  "guest_phone": "+77051234567",
  "guest_name": "Иван Иванов",
  "items": [
    {
      "campaign_item_id": 1,
      "qty": 20
    }
  ]
}
```

**Response:**
```json
{
  "campaign_order": {
    "id": 15,
    "campaign_id": 1,
    "client_id": "uuid",
    "status": "pending",
    "total": 5000,
    "created_at": "..."
  },
  "message": "Order created successfully"
}
```

**Validation:**
- Кампания должна быть `published`
- `closes_at > NOW()`
- `qty >= min_qty`
- `qty % pack_size === 0`
- Для авторизованных: `price_group` должна быть в `allowed_price_groups`

**Behaviour:**
- Если предзаказ уже существует → обновляет total и позиции
- Если статус `confirmed` → ошибка (нельзя изменять подтверждённый)

**Access:** Авторизованные клиенты или гости (с phone+name)

---

### 7. DELETE /api/campaigns/[id]/order
Отменить свой предзаказ

**Response:**
```json
{
  "message": "Order cancelled successfully"
}
```

**Validation:**
- Только до `closes_at`
- Только свой заказ

**Access:** Авторизованные клиенты

---

### 8. GET /api/campaigns/[id]/summary
Получить сводный заказ поставщику

**Query Parameters:**
- `format`: `json` (default) | `excel`

**Response (JSON):**
```json
{
  "campaign": {
    "id": 1,
    "title": "Голландия 15 мая",
    "type": "europe",
    "delivery_date": "2026-05-20",
    "status": "published"
  },
  "summary": [
    {
      "campaign_item_id": 1,
      "product_id": 123,
      "product_name": "Роза Red Naomi 60см",
      "variety_name": "Red Naomi",
      "length_str": "60",
      "price": 250.00,
      "pack_size": 10,
      "total_qty_ordered": 200,
      "total_orders": 8,
      "orders_breakdown": [
        {
          "client_id": "uuid",
          "client_name": "ИП Цветочный рай",
          "qty": 50
        },
        ...
      ]
    }
  ],
  "totals": {
    "total_items": 5,
    "total_qty": 1500,
    "total_amount": 375000,
    "total_clients": 12
  }
}
```

**Response (Excel):**
Binary .xlsx file с двумя листами:
1. **Сводный заказ** — суммарные количества по позициям
2. **По клиентам** — разбивка кто сколько заказал

**Access:** Admin / Manager only

---

### 9. POST /api/campaigns/[id]/convert
Массово конвертировать все предзаказы в обычные заказы

**Response:**
```json
{
  "message": "Conversion completed",
  "total": 12,
  "successful": 11,
  "failed": 1,
  "results": [
    {
      "campaign_order_id": 15,
      "new_order_id": 456,
      "success": true,
      "error_message": null
    },
    {
      "campaign_order_id": 16,
      "new_order_id": null,
      "success": false,
      "error_message": "Insufficient stock"
    }
  ],
  "new_order_ids": [456, 457, 458, ...]
}
```

**Behaviour:**
- Создаёт `orders` со статусом `pending`
- Копирует `order_items`
- Обновляет `campaign_orders.converted_to_order_id`
- Меняет `campaigns.status = 'delivered'`

**Access:** Admin / Manager only

---

## Workflow примеры

### Создание кампании
```javascript
// 1. Создать кампанию
const campaign = await fetch('/api/campaigns', {
  method: 'POST',
  body: JSON.stringify({
    title: 'Голландия 20 мая',
    type: 'europe',
    closes_at: '2026-05-15T18:00:00+05:00',
    delivery_date: '2026-05-20',
    items: [
      { product_id: 123, price: 250, pack_size: 10 }
    ]
  })
});

// 2. Опубликовать
await fetch(`/api/campaigns/${campaign.id}`, {
  method: 'PATCH',
  body: JSON.stringify({ status: 'published' })
});
```

### Оформление предзаказа (клиент)
```javascript
// 1. Получить детали кампании
const { campaign, items } = await fetch('/api/campaigns/1').then(r => r.json());

// 2. Оформить заказ
const order = await fetch('/api/campaigns/1/order', {
  method: 'POST',
  body: JSON.stringify({
    items: [
      { campaign_item_id: 1, qty: 20 },
      { campaign_item_id: 2, qty: 50 }
    ]
  })
});
```

### Сводный заказ и конвертация (менеджер)
```javascript
// 1. Посмотреть сводку
const summary = await fetch('/api/campaigns/1/summary').then(r => r.json());

// 2. Скачать Excel
window.open('/api/campaigns/1/summary?format=excel');

// 3. После поставки - конвертировать в заказы
const result = await fetch('/api/campaigns/1/convert', {
  method: 'POST'
});

console.log(`Создано заказов: ${result.successful}`);
```

---

## Статус-коды ошибок

| Код | Описание |
|-----|----------|
| 400 | Невалидные данные или кампания закрыта |
| 401 | Требуется авторизация |
| 403 | Недостаточно прав (не admin/manager или не VIP) |
| 404 | Кампания/заказ не найден |
| 500 | Внутренняя ошибка сервера |

---

## Типы данных

См. файл `campaigns-types.ts` для полных TypeScript определений.

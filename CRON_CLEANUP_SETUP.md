# Cron Cleanup Setup для Vercel

## Описание

Автоматический cron job, который каждые 5 минут удаляет истекшие резервирования и пересчитывает доступное количество товара.

## Endpoint: /api/cron/cleanup

- **Метод**: GET
- **Расписание**: каждые 5 минут (`*/5 * * * *`)
- **Защита**: Bearer token в заголовке `Authorization`
- **Ответ**:
```json
{
  "success": true,
  "deleted_count": 15,
  "affected_products": 8,
  "timestamp": "2026-04-25T10:00:00.000Z"
}
```

## Настройка в Vercel

1. **Переменная окружения CRON_SECRET**:
   - Перейдите в Vercel Settings → Environment Variables
   - Добавьте переменную `CRON_SECRET` с случайной строкой (рекомендуется 32+ символов)
   - Пример: `CRON_SECRET=abc123def456ghi789jkl012mno345pqr`

2. **Файл vercel.json**:
   - Уже создан в корне проекта
   - Содержит расписание cron job
   - Vercel автоматически распознает и активирует после deploy

3. **Service Role Key для cron**:
   - Cron job использует `SUPABASE_SERVICE_ROLE_KEY` для мутаций
   - Ключ должен быть доступен в Vercel settings
   - ⚠️ Используется ТОЛЬКО для cron, не для других endpoints

## Тестирование локально

```bash
# В .env.local
CRON_SECRET=your-test-secret

# Тестовый запрос
curl -H "Authorization: Bearer your-test-secret" http://localhost:3000/api/cron/cleanup
```

## SQL: Проверка структуры stock таблицы

Убедитесь, что таблица `stock` имеет колонку `qty_reserved`:

```sql
-- Проверить структуру
\d stock;

-- Если колонки нет, добавить:
ALTER TABLE stock ADD COLUMN qty_reserved INTEGER DEFAULT 0;

-- Создать индекс для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_stock_product_id ON stock(product_id);
```

## SQL: Проверка reservations таблицы

```sql
-- Убедитесь, что есть индекс на expires_at для быстрого поиска истекших
CREATE INDEX IF NOT EXISTS idx_reservations_expires_at ON reservations(expires_at);

-- Проверить структуру
\d reservations;
```

## Мониторинг

Vercel автоматически логирует результаты cron jobs. Вы можете проверить логи:

1. Перейдите в Vercel Dashboard → Project
2. Откройте вкладку "Deployments"
3. Нажмите на текущий deployment
4. Откройте вкладку "Functions"
5. Найдите `/api/cron/cleanup` и смотрите логи

## Отладка

**Если cron не выполняется:**
- Проверьте, что `CRON_SECRET` установлена в Vercel settings
- Убедитесь, что `SUPABASE_SERVICE_ROLE_KEY` доступна
- Проверьте логи в Vercel Dashboard

**Если есть ошибки удаления:**
- Проверьте RLS политики на таблице `reservations`
- Убедитесь, что service role имеет доступ к удалению

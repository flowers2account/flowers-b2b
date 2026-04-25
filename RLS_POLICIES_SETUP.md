# RLS Policies Setup для Supabase

Применить эти SQL скрипты в Supabase Dashboard → SQL Editor.

## 1. RLS Policy для UPDATE на order_items

Клиент может обновлять товары в заказе, если заказ принадлежит ему:

```sql
CREATE POLICY "Clients can update their order items" ON order_items
FOR UPDATE
TO authenticated
USING (
  order_id IN (
    SELECT id FROM orders WHERE client_id = auth.uid()
  )
)
WITH CHECK (
  order_id IN (
    SELECT id FROM orders WHERE client_id = auth.uid()
  )
);
```

## 2. RLS Policy для SELECT на orders

Клиент может видеть свои заказы:

```sql
CREATE POLICY "Clients can view their own orders" ON orders
FOR SELECT
TO authenticated
USING (client_id = auth.uid());
```

## 3. RLS Policy для UPDATE на orders

Клиент может обновлять свои заказы (например, менять статус на cancelled):

```sql
CREATE POLICY "Clients can update their own orders" ON orders
FOR UPDATE
TO authenticated
USING (client_id = auth.uid())
WITH CHECK (client_id = auth.uid());
```

## Шаги применения:

1. Откройте Supabase Dashboard → выберите проект
2. Перейдите в SQL Editor
3. Скопируйте каждый блок SQL выше
4. Нажмите "Run" для каждого скрипта
5. Убедитесь, что нет ошибок

## Проверка применения:

После создания политик, проверьте:
- GET /api/my-orders должен показывать только заказы пользователя
- POST /api/cancel-order должен работать без ошибок
- POST /api/update-order-qty должен работать без ошибок

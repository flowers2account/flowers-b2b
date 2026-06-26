# RLS — фактическое состояние (Flowers B2B)

> **Обновлено:** 2026-06-26 (снято с живой БД `jwastcmasactymmzojhi`).  
> ⚠️ Старая версия предлагала политики `client_id = auth.uid()` на orders/order_items. Боевые политики иные (см. ниже) — клиентские данные читаются через service-role роуты, а не клиентским RLS.

## Где RLS включён

`relrowsecurity = true` на: `products, orders, order_items, reservations, clients, profiles, inventory_ledger, order_history, translation_memory, campaigns, campaign_items, campaign_orders, campaign_order_items, campaign_access, conversations, messages, invoices, payments, payment_operations, registration_requests, access_requests, bot_enabled_leads`.

**RLS выключен** на: `app_settings`, `campaign_staging`, `favorites`, все `*_backup_*` / `dedup_*`.

## Хелперы (SECURITY DEFINER)

- `is_admin_or_manager()` — `EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('admin','manager'))`.
- `is_admin()` — то же, только `admin`.

## Ключевые политики (факт)

### products
- `products: public read active` — `SELECT` для public: `USING (is_active = true)`.
- `products: admin reads all` / `products: admin write` — `is_admin_or_manager()`.

### orders / order_items / clients / inventory_ledger
- `orders: admin all`, `order_items: admin all`, `clients: admin write`/`reads all`, `ledger: admin reads all`/`inserts` — **только `is_admin_or_manager()`**.
- Клиент видит свои заказы НЕ через RLS, а через серверные роуты на service-role (`/api/my-orders`, `/api/cabinet`, `/api/client/*`), которые сами резолвят `auth.uid() → clients.id`.

### profiles
- `read own` / `update own` — `id = auth.uid()`; `admin reads all` — `is_admin_or_manager()`; `admin updates all` — `is_admin()`.

### reservations
- `*_own` (select/update/delete) — `client_id = auth.uid() OR (admin/manager)`; insert — `auth.uid() IS NOT NULL`.
- ⚠️ `reservations.client_id` ссылается на **`auth.users(id)`** (а `orders.client_id` — на `clients(id)`). В reservations это auth-uid.

### translation_memory
- anon — `SELECT` при `is_flagged=false AND approved_by IS NOT NULL`; admin/manager — всё.

### campaigns / campaign_items / campaign_orders / campaign_access
- `campaigns_select_published` — public читает опубликованные; запись — admin.
- `campaign_items` закрыт для anon (политики admin). Публичный доступ к позициям — только через SECURITY DEFINER RPC `get_preorder_room(campaign_id, token)`.
- `campaign_access` — admin + публичный INSERT (заявка по коду).

## Паттерн доступа в коде

- **Витрина (anon + RLS):** `createClient()` из `src/lib/supabase/server.ts` — `/api/products`, `/api/search`, `/api/facets`, `/api/cashier/products`.
- **Admin/серверные мутации:** `createAdminClient()` (service-role, обходит RLS) — большинство роутов. ⚠️ Многие из них не проверяют сессию/роль (см. `DOCS_AUDIT_REPORT.md` §5) — защита только серверностью.
- **Admin read/write без service-role:** SECURITY DEFINER RPC под anon-ключом (`admin_*`, `get_admin_preorders`, `get_preorder_room`). ⚠️ Открыты для anon-роли; защита — клиентский гард `/admin`.

## Как смотреть актуальные политики

```sql
SELECT tablename, policyname, cmd, roles FROM pg_policies WHERE schemaname='public' ORDER BY 1,2;
SELECT relname, relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND relkind='r' ORDER BY 1;
```

Стратегия и план RLS-роллаута — `docs/SECURITY-RLS-PLAN.md`, инцидент с anon-грантами — `docs/SECURITY-ANON-FIX.md`.
</content>

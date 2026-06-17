# Security fix: закрытие anon-дыры после перестройки каталога

**Статус: ✅ ЗАВЕРШЕНО — 17.06.2026.** БД: flower-stock (`jwastcmasactymmzojhi`), прод: VPS `uralskflowers.kz`.
Связанный документ: [`SECURITY-RLS-PLAN.md`](./SECURITY-RLS-PLAN.md) (этап 11.06 — clients/orders/order_items).

## Что было (инцидент)

Перестройка каталога **откатила защиту**: роль `anon` получила полный набор прав
(`SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER`) на **~50 public-таблицах**,
включая:
- `products` — можно было снести витрину из браузера (`TRUNCATE`/`DELETE`/`UPDATE`);
- `profiles` (RLS on, но грант висел) — вектор на смену ролей;
- 15+ `_backup_*` / `*_backup_*` таблиц с **ПД клиентов и заказов**;
- справочники, `app_settings`, `stock_*`, `campaign_*` и т.д.

Плюс **~11 `SECURITY DEFINER` функций** `admin_*` / `get_admin_*` были исполнимы `anon`
через REST (`get_admin_preorders` отдавала данные клиентов, `admin_set_preorder_status`
менял статусы и т.д.) — вторая дыра.

**Первопричина:** в Postgres новые объекты получают дефолтный грант **PUBLIC**
(таблицы — на этапе пересоздания скриптом, функции — `EXECUTE TO PUBLIC` по умолчанию).
`anon`/`authenticated` — члены `PUBLIC` → доступ открылся автоматически.

## Архитектурный нюанс (почему нельзя было просто REVOKE)

`@/lib/supabase/server` `createClient()` использует **anon-ключ**; сессия живёт в
localStorage, **куки пустые** → серверные API-роуты с этим клиентом выполняются под
ролью **`anon`** и зависели от anon-грантов на RLS-off таблицах. Поэтому перед REVOKE
эти роуты переведены на `createAdminClient()` (service role; на VPS работает надёжно).

## Что сделано (шаги A–E, 17.06.2026)

| Шаг | Что | Артефакт |
|---|---|---|
| **A** | Admin/import server-роуты с anon-клиента → `createAdminClient()` (service role). import-xls (apply/match/create-product/rows/pending/route/finalize), preorder-actions, settings/notifications, preorder/launch. Авторизация (`getAuthedWithRole`) не тронута. | commit `6c5d8ca` |
| **B-код** | Остаточные anon-server пути → service role: `ai-enrichment`, `translations/batch`, `import-oz-preorder`, `preorder/[id]/join\|admit\|status`. | commit `33516fa` |
| **B1** | `REVOKE ALL FROM anon` на `profiles`, `access_requests`. | mig `secure_anon_b1_profiles_access` |
| **B2** | `REVOKE ALL FROM anon` на 17 справочниках/служебных (varieties, flower_types, characteristic_*, search_synonyms, stop_words, price_rules, stock_aliases, stock_import_rows, writeoffs, inventory_counts, inventory_sessions, imports, bot_enabled_leads, dedup_mapping_20260525, app_settings). | mig `secure_anon_b2_dictionaries_service` |
| **B3** | `REVOKE ALL FROM anon` на RLS-on (payments, reservations, campaign_orders/order_items/items/campaigns — косметика) + favorites. | mig `secure_anon_b3_rls_on_and_favorites` |
| **B-defer** | `REVOKE ALL FROM anon` на species, translation_memory, campaign_staging, campaign_access (после миграции их роутов на service role). | mig `secure_anon_b_deferred_tables` |
| **B-clean** | `stock_available` (view) — снят write, оставлен SELECT; `translation_memory_context`/`_enriched` — REVOKE ALL. | mig `secure_anon_b_remaining_cleanup` |
| **C** | `DROP TABLE _backup_orders_pre_rebuild` (21 строка ПД заказов, нет ссылок в коде). | mig `secure_c_drop_backup_orders` |
| **D** | `REVOKE EXECUTE FROM PUBLIC, anon, authenticated` + `GRANT EXECUTE TO service_role` на 11 функциях (get_admin_preorders, get_admin_summary, admin_set_preorder_status, admin_assemble_preorder ×2, admin_save_preorder_edits, admin_bulk_preorder_status, admin_admit_request, admin_get_campaign_items, convert_all_campaign_orders, convert_campaign_order_to_order, calc_preorder_price_kzt). Публичными оставлены `get_preorder_room`, `get_preorder_access_status`. | mig `secure_d_revoke_admin_fn_execute_public` |
| **E** | `ENABLE ROW LEVEL SECURITY` на `products`. Политика `products: public read active` (`qual is_active=true`, role public) даёт anon SELECT активных. | mig `secure_e_enable_rls_products` |

> Группы 1–2 (products write + backup-таблицы) сделаны ранее в рамках той же операции
> (миграции `secure_anon_revoke_products_dml`, `secure_anon_revoke_backup_tables`).

> ⚠️ **Грабли D:** первый `REVOKE ... FROM anon, authenticated` **не подействовал** —
> EXECUTE наследуется через дефолтный грант **PUBLIC**. Нужно снимать с PUBLIC и явно
> выдавать `service_role`.

## Итоговое состояние (проверено по базе 17.06.2026)

- **anon-гранты на таблицы:** только `products` (SELECT) и `stock_available` (SELECT, read-only view). Всё остальное — ноль.
- **products:** RLS ON. `anon` видит 4685 активных из 8019 (3334 неактивных скрыты). `service_role` обходит RLS (admin/import). Каталог жив: `/api/products` 658 товаров, `/catalog` /`/api/facets`/`/api/search`/`/api/search-products` — 200.
- **stock_available:** view owner=`postgres`, не `security_invoker` → читает products правами владельца, RLS на products её не ломает (касса/поиск работают).
- **admin-функции:** EXECUTE только `service_role`; `anon`/`authenticated` → `42501 permission denied`. Админка предзаказов работает (Server Actions на service role).
- **Бэкап перед операцией:** `supabase_2026-06-17_142855.dump` на VPS (`/srv/backups/supabase/`).

## Откат (по шагам, без деплоя кроме кода)

```sql
-- E:
ALTER TABLE public.products DISABLE ROW LEVEL SECURITY;
-- D (вернуть публичный EXECUTE — обычно не нужно, ломает защиту):
--   GRANT EXECUTE ON FUNCTION public.get_admin_preorders() TO anon, authenticated;  -- и т.д. по списку
-- C: восстановить из дампа supabase_2026-06-17_142855.dump (таблица удалена).
-- B/Group1-2: вернуть гранты точечно, напр.:
--   GRANT SELECT,INSERT,UPDATE,DELETE ON public.<table> TO anon;
-- A/B-код: git revert коммитов 6c5d8ca / 33516fa.
```

## Бэклог (отдельным решением)

- **DROP остальных `_backup_*_pre_rebuild` с ПД** (`_backup_order_items_pre_rebuild`,
  `_backup_campaign_orders_pre_rebuild`, `_backup_campaign_order_items_pre_rebuild`,
  `_backup_reservations_pre_rebuild` и пр.) — сейчас закрыты от anon, но содержат данные.
- **Дефолтные гранты:** рассмотреть `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;`
  и аналогично для таблиц, чтобы новые объекты не открывались автоматически.

## Правило на будущее

**После ЛЮБОЙ перестройки/пересоздания таблиц или создания новых функций — проверять anon-гранты:**
```sql
-- таблицы с anon-грантами (ожидаем только products/stock_available SELECT):
select table_name, string_agg(privilege_type,', ') from information_schema.role_table_grants
where grantee='anon' and table_schema='public' group by table_name;
-- функции, исполнимые anon:
select p.proname, has_function_privilege('anon',p.oid,'EXECUTE')
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public';
```

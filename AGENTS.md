<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Контекст проекта для AI-агентов — Flowers B2B

> Обновлено: 2026-06-26. Старт-контекст — `CONTEXT_FOR_NEW_SESSION.md`. Полная техдока — `CLAUDE.md`. Расхождения старых доков с фактом — `DOCS_AUDIT_REPORT.md`.

**Стек:** Next.js 16 (App Router, standalone), React 19, TypeScript, Tailwind, Zustand, Supabase (PostgreSQL+RLS, проект `jwastcmasactymmzojhi`). Прод — VPS hoster.kz (push→main → GitHub Actions). Vercel = только preview (авто-деплой с main отключён).

**Что важно знать сразу:**
- **Остатки плоские** — остаток в `products.qty`, цена в `products.price`. Таблиц `batches`/`stock` НЕТ. Доступность — view `stock_available`. FIFO удалён (`confirm_order_fifo` — простое списание, имя историческое).
- **Поле названия для клиента — `display_name`** (НЕ `name_display`). `products.name` — неизменяемый якорь импорта.
- **Доступ к БД:** `createAdminClient()` (service-role, обходит RLS — работает на проде) для серверных роутов; `createClient()` (anon+RLS) для read-витрины; часть admin-операций через SECURITY DEFINER RPC.
- **RLS включён** почти везде (см. `RLS_POLICIES_SETUP.md`).
- **Cron:** `vercel.json` — один крон `/api/cron/cleanup` `0 0 * * *` (раз в сутки). Второй (`widget-amo-sync`) — внешним планировщиком.
- **Auth:** телефон+PIN, email = `{цифры}@flowers.local`, `normalizePhone()` → `+7XXXXXXXXXX`.

**Окружение / правила:**
- PowerShell на Windows: нет `&&`, нет `grep`/`curl` (используй `Invoke-RestMethod`). Не писать файлы с кириллицей/JSX через `Set-Content` (корёжит кодировку) — редактировать инструментами.
- Часовой пояс — Asia/Oral (UTC+5).
- Реквизиты компании — единый источник `src/config/company.ts`.
- Категории `products.category`: `cut` / `pot` / `accessories`.

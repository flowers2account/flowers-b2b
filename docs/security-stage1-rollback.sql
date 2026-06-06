-- ============================================================
-- Security Stage 1 — RLS ROLLBACK
-- ============================================================
-- Дата применения этапа 1: 2026-06-06
-- Назначение: откат включения RLS, если что-то сломалось.
-- Возвращает затронутые таблицы в состояние «RLS отключён»
-- (как было до этапа 1). Политики на этих таблицах не создавались,
-- поэтому отключения RLS достаточно для полного отката.
--
-- Применение (любой из вариантов):
--   • Supabase SQL Editor — вставить и выполнить;
--   • psql:  psql "<conn>" -f docs/security-stage1-rollback.sql
-- ============================================================

ALTER TABLE public.payments           DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_sessions DISABLE ROW LEVEL SECURITY;

-- Проверка после отката (ожидаем rls_enabled = false):
-- select relname, relrowsecurity from pg_class
-- where relname in ('payments','inventory_sessions');

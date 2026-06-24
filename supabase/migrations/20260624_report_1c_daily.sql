-- Ежедневный отчёт об автосинхронизации 1С (WhatsApp менеджеру/владельцу).
-- Собирает метрики из stock_apply_log (журнал применённых снимков, переживает очистку
-- staging) + stock_import_rows (состав ПОСЛЕДНЕГО снимка live-фида 1С, source='1c-ip').
-- Всё считается в таймзоне Asia/Oral. Read-only (stable). Логика тревог — в TS.
--
-- Замечание по источникам: боевой фид 1С — source='1c-ip' (apply_log тоже '1c-ip',
-- unmatched ~67). Прочие источники в stock_import_rows ('1c-too', 'cut') — устаревшие
-- остатки, в отчёт не входят.
create or replace function public.report_1c_daily()
returns jsonb
language sql
stable
as $$
  with y as (
    select * from public.stock_apply_log
    where (created_at at time zone 'Asia/Oral')::date = (now() at time zone 'Asia/Oral')::date - 1
  ),
  snap as (
    select
      count(*) as total,
      count(*) filter (where matched_product_id is not null) as matched,
      count(*) filter (where matched_product_id is null) as unmatched
    from public.stock_import_rows
    where source = '1c-ip'
  ),
  la as ( select max(created_at) as mx from public.stock_apply_log )
  select jsonb_build_object(
    'now_oral',              to_char(now() at time zone 'Asia/Oral', 'YYYY-MM-DD HH24:MI'),
    'today_date',            to_char((now() at time zone 'Asia/Oral')::date, 'DD.MM'),
    'yesterday_date',        to_char((now() at time zone 'Asia/Oral')::date - 1, 'DD.MM'),
    'cur_hour_oral',         extract(hour from now() at time zone 'Asia/Oral')::int,
    'snapshots_yesterday',   (select count(*) from y),
    'first_time',            (select to_char(min(created_at at time zone 'Asia/Oral'), 'HH24:MI') from y),
    'last_time',             (select to_char(max(created_at at time zone 'Asia/Oral'), 'HH24:MI') from y),
    'changes_total',         (select coalesce(sum(changed_total), 0) from y),
    'snapshot_total',        (select total from snap),
    'snapshot_matched',      (select matched from snap),
    'snapshot_unmatched',    (select unmatched from snap),
    'showcase',              (select count(*) from public.products
                               where category = 'accessories' and is_active = true and qty > 0 and image_url is not null),
    'last_snapshot_oral',    (select to_char(mx at time zone 'Asia/Oral', 'YYYY-MM-DD HH24:MI') from la),
    'last_snapshot_age_min', (select round(extract(epoch from (now() - mx)) / 60)::int from la)
  );
$$;

-- ============================================================================
-- Серверный поиск каталога витрины: RPC search_products + trgm-инфраструктура.
-- Применяется ВРУЧНУЮ (не автоматически к проду).
--
-- Используется /api/search → компонент SearchBox. Ранжирование «лестницей»:
--   70  префикс по display_name/name
--   50  вхождение
--   30  все слова запроса присутствуют
--   fallback по word_similarity(q, display_name||' '||name) > 0.45 (опечатки/словоформы)
--
-- word_similarity (а не обычный similarity): меряет похожесть запроса на ЛУЧШИЙ
-- фрагмент строки, а не на строку целиком — иначе длинный хвост названия размывает
-- оценку («горшек» vs «…горшечных растений 500гр» = 0.71 против 0.08). Тот же приём,
-- что в search_accessories_trgm (миграция 20260611).
--
-- ⚠️ В таблице products НЕТ колонки артикула (sku/article/code 1С) — поиск по
--    артикулу здесь НЕ реализован (деградация до поиска по названию). Когда колонку
--    заведут, добавить в лестницу ступени 100 (точное) и 80 (вхождение) по артикулу.
-- ============================================================================

create extension if not exists pg_trgm;

-- GIN trgm-индексы по названиям (большинство уже создано миграцией
-- 20260611_trgm_accessories_search — здесь идемпотентно).
create index if not exists products_display_name_trgm_idx
  on public.products using gin (display_name gin_trgm_ops);

create index if not exists products_name_trgm_idx
  on public.products using gin (name gin_trgm_ops);

-- ── RPC ─────────────────────────────────────────────────────────────────────
-- По умолчанию ищет по ВСЕМУ каталогу витрины. p_category / p_subcategory — доп.
-- сужение. Жёсткие фильтры: is_active, price>0, hidden_for_demo=false и
-- source IN (uralsk_site, uralsk_1c) — ровно та область, что видна на витрине.
create or replace function public.search_products(
  q text,
  p_category text default null,
  p_subcategory text default null
)
returns table (
  id int,
  name text,
  display_name text,
  subcategory text,
  category text,
  price numeric,
  qty int,
  image_url text,
  rank int,
  sim real
)
language sql
stable
as $$
  with params as (
    select translate(lower(btrim(q)), 'ё', 'е') as qn
  ),
  esc as (
    select qn, replace(replace(replace(qn, '\', '\\'), '%', '\%'), '_', '\_') as qlike
    from params
  ),
  base as (
    select
      p.id, p.name, p.display_name, p.subcategory, p.category, p.price, p.qty, p.image_url,
      translate(lower(coalesce(p.display_name, '') || ' ' || coalesce(p.name, '')), 'ё', 'е') as hay
    from public.products p
    where p.is_active = true
      and p.price > 0
      and coalesce(p.hidden_for_demo, false) = false
      and p.source in ('uralsk_site', 'uralsk_1c')
      and (p_category is null or p.category = p_category)
      and (p_subcategory is null or p.subcategory = p_subcategory)
  ),
  scored as (
    select b.id, b.name, b.display_name, b.subcategory, b.category, b.price, b.qty, b.image_url,
      case
        when (select qn from params) = '' then 0
        when b.hay like (select qlike from esc) || '%' escape '\' then 70
        when b.hay like '%' || (select qlike from esc) || '%' escape '\' then 50
        when (
          select bool_and(
            b.hay like '%' || replace(replace(replace(w, '\', '\\'), '%', '\%'), '_', '\_') || '%' escape '\'
          )
          from regexp_split_to_table((select qn from params), '\s+') as w
          where length(w) > 0
        ) then 30
        else 0
      end as rank,
      word_similarity((select qn from params), b.hay) as sim
    from base b
  )
  select id, name, display_name, subcategory, category, price, qty, image_url, rank, sim
  from scored
  where rank > 0 or sim > 0.45
  order by rank desc, sim desc, (qty > 0) desc, price asc
  limit 50;
$$;

comment on function public.search_products is
  'Поиск каталога витрины для /api/search. Лестница ранга (префикс/вхождение/все слова) + word_similarity-фолбэк >0.45. Область = витрина (is_active, price>0, hidden_for_demo=false, source IN uralsk_*). Артикул не поддержан — нет колонки.';

-- RPC вызывается серверным клиентом на anon-ключе (паттерн /api/products).
grant execute on function public.search_products(text, text, text) to anon, authenticated;

-- Нечёткий поиск товаров для ИИ-бота: pg_trgm + GIN-индексы + RPC similarity-поиска.
-- Применяется вручную (не к проду автоматически).

create extension if not exists pg_trgm;

create index if not exists products_display_name_trgm_idx
  on public.products using gin (display_name gin_trgm_ops);

create index if not exists products_name_trgm_idx
  on public.products using gin (name gin_trgm_ops);

-- Similarity-поиск по расходке: max(similarity) по всем keywords, порог 0.3,
-- сортировка по убыванию похожести. supabase-js не умеет similarity напрямую — поэтому RPC.
create or replace function public.search_accessories_trgm(p_keywords text[], p_limit int default 20)
returns table (
  id int,
  display_name text,
  subcategory text,
  price numeric,
  unit text,
  qty int,
  pack_size int,
  sim real
)
language sql
stable
as $$
  select p.id, p.display_name, p.subcategory, p.price, p.unit, p.qty, p.pack_size,
         (select max(greatest(
            similarity(coalesce(p.display_name, ''), kw),
            similarity(p.name, kw)
          )) from unnest(p_keywords) kw) as sim
  from public.products p
  where p.category = 'accessories'
    and p.is_active
    and p.price > 0
    and p.hidden_for_demo = false
    and exists (
      select 1 from unnest(p_keywords) kw
      where similarity(coalesce(p.display_name, ''), kw) > 0.3
         or similarity(p.name, kw) > 0.3
    )
  order by sim desc
  limit p_limit;
$$;

comment on function public.search_accessories_trgm is
  'Fallback-поиск ИИ-бота: trigram similarity по display_name/name среди accessories. Вызывается service-role.';

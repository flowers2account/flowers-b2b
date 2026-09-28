-- pf_catalog_groups — дерево подкатегорий Proflowers (nomenclature → группы → листья).
-- pf_product_groups — связь товар (product_id) → лист. Составной уникальный ключ, НЕ
-- product_id как единственный PK — товар технически может оказаться в нескольких листьях
-- (на снепшоте 24.09.2026, 58 листьев/2278 товаров, пересечений не найдено — см. разведку,
-- но это эмпирика одного дня одной номенклатуры, не гарантия схемы).

create table if not exists public.pf_catalog_groups (
  id bigserial primary key,
  pf_group_id bigint not null unique,
  parent_pf_group_id bigint references public.pf_catalog_groups (pf_group_id),
  name text not null,
  nomenclature_id integer,
  has_children boolean not null default false,
  synced_at timestamptz not null default now()
);

create table if not exists public.pf_product_groups (
  product_id bigint not null references public.pf_products (pf_product_id),
  pf_group_id bigint not null references public.pf_catalog_groups (pf_group_id),
  synced_at timestamptz not null default now(),
  primary key (product_id, pf_group_id)
);

alter table public.pf_catalog_groups enable row level security;
alter table public.pf_product_groups enable row level security;
revoke all on public.pf_catalog_groups from anon, authenticated;
revoke all on public.pf_product_groups from anon, authenticated;
revoke all on sequence public.pf_catalog_groups_id_seq from anon, authenticated;

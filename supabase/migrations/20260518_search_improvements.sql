-- ============================================================
-- Search improvements: search_aliases, translit(), GIN indexes
-- ============================================================

-- 1. Add search_aliases column
ALTER TABLE products ADD COLUMN IF NOT EXISTS search_aliases TEXT[];

-- 2. Enable pg_trgm for fuzzy matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 3. Translit function: Cyrillic → Latin (for cross-script search)
CREATE OR REPLACE FUNCTION translit(t TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT translate(
    lower(t),
    'абвгдеёжзийклмнопрстуфхцчшщъыьэюя',
    'abvgdeyoziyklmnoprstufhtschshschy eya'
  )
$$;

-- 4. GIN index on Russian full-text search
CREATE INDEX IF NOT EXISTS idx_products_search_ru
  ON products
  USING gin(to_tsvector('russian',
    coalesce(name, '') || ' ' ||
    coalesce(variety_name, '') || ' ' ||
    coalesce(array_to_string(search_aliases, ' '), '')
  ));

-- 5. Trigram index on variety_name for fuzzy / partial match
CREATE INDEX IF NOT EXISTS idx_products_variety_trgm
  ON products
  USING gin(lower(coalesce(variety_name, '')) gin_trgm_ops);

-- 6. Trigram index on name for fuzzy / partial match
CREATE INDEX IF NOT EXISTS idx_products_name_trgm
  ON products
  USING gin(lower(name) gin_trgm_ops);

-- 7. GIN index on search_aliases array for exact alias lookup
CREATE INDEX IF NOT EXISTS idx_products_aliases_gin
  ON products
  USING gin(search_aliases);

-- Example: populate aliases for common cross-script searches
-- UPDATE products SET search_aliases = ARRAY['chr baltica', 'baltica', 'балтика']
-- WHERE lower(variety_name) LIKE '%балтик%';

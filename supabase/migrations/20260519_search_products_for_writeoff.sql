CREATE OR REPLACE FUNCTION search_products_for_writeoff(search_query text)
RETURNS TABLE (
  id        integer,
  name      text,
  variety_name text,
  length_str   text,
  qty          integer,
  qty_reserved integer,
  available    integer,
  price        numeric
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    p.id,
    p.name::text,
    COALESCE(p.variety_name, p.name)::text AS variety_name,
    p.length_str::text,
    sa.qty::integer,
    sa.qty_reserved::integer,
    sa.available_qty::integer AS available,
    sa.price::numeric
  FROM products p
  INNER JOIN stock_available sa ON sa.product_id = p.id
  WHERE p.is_active = true
    AND sa.qty > 0
    AND (
      p.name      ILIKE '%' || search_query || '%'
      OR p.variety_name ILIKE '%' || search_query || '%'
    )
  ORDER BY COALESCE(p.variety_name, p.name)
  LIMIT 15;
$$;

-- Store guest name alongside phone on guest orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS guest_name TEXT;

-- Authenticated users can update their own name+phone in clients
-- (regular UPDATE RLS doesn't exist for clients, so SECURITY DEFINER is needed)
CREATE OR REPLACE FUNCTION upsert_client_contact(p_phone TEXT, p_name TEXT)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE clients
  SET
    phone = COALESCE(NULLIF(p_phone, ''), phone),
    name  = COALESCE(NULLIF(p_name,  ''), name)
  WHERE id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION upsert_client_contact(TEXT, TEXT) TO authenticated;

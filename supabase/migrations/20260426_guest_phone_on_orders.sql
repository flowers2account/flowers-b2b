-- Add guest_phone column to orders for anonymous checkouts
ALTER TABLE orders ADD COLUMN IF NOT EXISTS guest_phone TEXT;

-- SECURITY DEFINER function so anon can find their own pending guest order by phone
CREATE OR REPLACE FUNCTION get_pending_guest_order_id(p_phone TEXT)
RETURNS INT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM orders
  WHERE guest_phone = p_phone
    AND client_id IS NULL
    AND status IN ('pending', 'reserved')
  ORDER BY created_at DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION get_pending_guest_order_id(TEXT) TO anon;

-- Allow anon to delete reservations by order_id (needed when updating guest order)
CREATE POLICY "reservations: guest delete by order" ON reservations FOR DELETE
  USING (user_id IS NULL AND auth.uid() IS NULL);

-- Allow anon to update orders where client_id IS NULL (to set guest_phone)
CREATE POLICY "orders: guest update own" ON orders FOR UPDATE
  USING (client_id IS NULL AND auth.uid() IS NULL)
  WITH CHECK (client_id IS NULL AND auth.uid() IS NULL);

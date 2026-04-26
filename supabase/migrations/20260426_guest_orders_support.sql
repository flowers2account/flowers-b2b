-- Make client_id nullable to support guest orders
ALTER TABLE orders ALTER COLUMN client_id DROP NOT NULL;

-- Allow anonymous users to create guest orders (client_id IS NULL)
CREATE POLICY "orders: guest creates" ON orders FOR INSERT
  WITH CHECK (client_id IS NULL AND auth.uid() IS NULL);

-- Allow anonymous users to insert items for guest orders
CREATE POLICY "order_items: guest insert" ON order_items FOR INSERT
  WITH CHECK (
    auth.uid() IS NULL AND
    EXISTS (SELECT 1 FROM orders o WHERE o.id = order_items.order_id AND o.client_id IS NULL)
  );

-- Allow anonymous users to create reservations (user_id IS NULL)
CREATE POLICY "reservations: guest insert" ON reservations FOR INSERT
  WITH CHECK (user_id IS NULL AND auth.uid() IS NULL);

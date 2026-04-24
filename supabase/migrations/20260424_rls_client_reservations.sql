-- Clients can read their own reservations (needed for order expiry display)
CREATE POLICY IF NOT EXISTS "clients_select_own_reservations"
ON reservations FOR SELECT
USING (user_id = auth.uid());

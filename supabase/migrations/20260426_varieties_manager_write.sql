-- Allow managers to create/update varieties during import (was admin-only)
CREATE POLICY "varieties: manager write" ON varieties
  FOR ALL USING (is_admin_or_manager())
  WITH CHECK (is_admin_or_manager());

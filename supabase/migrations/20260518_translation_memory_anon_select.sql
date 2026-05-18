-- Allow anon role to read approved, non-flagged translations.
-- The batch API route (/api/translations/batch) runs without an authenticated
-- session in Vercel serverless, so without this policy RLS silently returns 0 rows.
CREATE POLICY "Anon can read approved non-flagged translations"
ON translation_memory
FOR SELECT
TO anon
USING (is_flagged = false AND approved_by IS NOT NULL);

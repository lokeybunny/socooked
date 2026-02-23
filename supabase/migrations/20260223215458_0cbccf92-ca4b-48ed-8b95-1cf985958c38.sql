-- Fix: The existing policy is RESTRICTIVE (requires a PERMISSIVE policy too).
-- Drop and recreate as PERMISSIVE so authenticated+anon users can access.
DROP POLICY IF EXISTS "content_assets_all_access" ON public.content_assets;
CREATE POLICY "content_assets_all_access"
  ON public.content_assets
  FOR ALL
  USING (true)
  WITH CHECK (true);

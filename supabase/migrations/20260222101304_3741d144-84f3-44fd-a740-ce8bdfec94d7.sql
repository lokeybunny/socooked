
-- Drop all existing restrictive policies on api_previews
DROP POLICY IF EXISTS "Authenticated users can delete previews" ON public.api_previews;
DROP POLICY IF EXISTS "Authenticated users can insert previews" ON public.api_previews;
DROP POLICY IF EXISTS "Authenticated users can update previews" ON public.api_previews;
DROP POLICY IF EXISTS "Authenticated users can view previews" ON public.api_previews;
DROP POLICY IF EXISTS "Service role full access" ON public.api_previews;

-- Recreate as PERMISSIVE policies
CREATE POLICY "Anyone can view previews"
  ON public.api_previews FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert previews"
  ON public.api_previews FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update previews"
  ON public.api_previews FOR UPDATE
  USING (true);

CREATE POLICY "Anyone can delete previews"
  ON public.api_previews FOR DELETE
  USING (true);

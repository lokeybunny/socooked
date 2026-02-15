
-- Fix boards policy to not require authenticated role
DROP POLICY IF EXISTS "boards_all_authenticated" ON public.boards;

CREATE POLICY "boards_all_access"
  ON public.boards
  FOR ALL
  USING (true)
  WITH CHECK (true);

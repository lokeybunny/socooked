
-- Drop the restrictive policy and replace with a permissive one
DROP POLICY IF EXISTS "boards_rw" ON public.boards;

CREATE POLICY "boards_all_authenticated"
  ON public.boards
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

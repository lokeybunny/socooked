
-- Drop restrictive RLS policies on transcriptions
DROP POLICY IF EXISTS "Authenticated users can delete transcriptions" ON public.transcriptions;
DROP POLICY IF EXISTS "Authenticated users can insert transcriptions" ON public.transcriptions;
DROP POLICY IF EXISTS "Authenticated users can update transcriptions" ON public.transcriptions;
DROP POLICY IF EXISTS "Authenticated users can view transcriptions" ON public.transcriptions;

-- Add permissive policy matching the pattern of other tables
CREATE POLICY "transcriptions_all_access" ON public.transcriptions FOR ALL USING (true) WITH CHECK (true);

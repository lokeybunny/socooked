ALTER TABLE public.leadsrain_settings ADD COLUMN IF NOT EXISTS default_list_id text;
DROP POLICY IF EXISTS "Authenticated update settings" ON public.leadsrain_settings;
CREATE POLICY "Authenticated update settings" ON public.leadsrain_settings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated insert settings" ON public.leadsrain_settings;
CREATE POLICY "Authenticated insert settings" ON public.leadsrain_settings FOR INSERT TO authenticated WITH CHECK (true);
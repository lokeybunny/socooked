CREATE POLICY "Authenticated insert campaigns" ON public.leadsrain_campaigns FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update campaigns" ON public.leadsrain_campaigns FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete campaigns" ON public.leadsrain_campaigns FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "customers_public_funnel_insert" ON public.customers;

CREATE POLICY "customers_public_funnel_insert" ON public.customers
  FOR INSERT TO public
  WITH CHECK (source = ANY (ARRAY['videography-landing'::text, 'webdesign-landing'::text, 'liquidate-landing'::text]));

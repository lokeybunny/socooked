
CREATE POLICY "customers_public_funnel_insert"
ON public.customers
FOR INSERT
TO public
WITH CHECK (source IN ('videography-landing', 'webdesign-landing'));

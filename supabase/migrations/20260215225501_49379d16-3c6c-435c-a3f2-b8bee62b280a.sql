
-- Drop the restrictive policy and replace with a permissive one
DROP POLICY IF EXISTS "customers_all_access" ON public.customers;

CREATE POLICY "customers_all_access"
ON public.customers
AS PERMISSIVE
FOR ALL
USING (true)
WITH CHECK (true);

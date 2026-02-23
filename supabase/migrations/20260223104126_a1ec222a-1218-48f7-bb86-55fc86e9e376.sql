
-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Anyone can view active availability" ON public.availability_slots;
DROP POLICY IF EXISTS "Authenticated users can manage availability" ON public.availability_slots;

-- Create permissive policy matching other tables
CREATE POLICY "availability_slots_all_access"
ON public.availability_slots
FOR ALL
USING (true)
WITH CHECK (true);

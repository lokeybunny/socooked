
-- Drop the overly permissive service policy
DROP POLICY "Service can manage transcriptions" ON public.transcriptions;

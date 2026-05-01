DROP POLICY IF EXISTS "Authenticated users can delete missed call events" ON public.missed_call_events;

CREATE POLICY "Authenticated users can delete missed call events"
ON public.missed_call_events
FOR DELETE
TO authenticated
USING (auth.role() = 'authenticated');
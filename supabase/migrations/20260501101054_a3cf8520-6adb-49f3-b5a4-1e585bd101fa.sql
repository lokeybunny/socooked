CREATE POLICY "Authenticated users can delete missed call events"
ON public.missed_call_events
FOR DELETE
TO authenticated
USING (true);
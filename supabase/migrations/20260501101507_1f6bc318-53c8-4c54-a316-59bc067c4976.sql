ALTER TABLE public.missed_call_events REPLICA IDENTITY FULL;
ALTER TABLE public.missed_call_webhook_audit REPLICA IDENTITY FULL;
DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.missed_call_events; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.missed_call_webhook_audit; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
ALTER TABLE public.phone_audit_jobs REPLICA IDENTITY FULL;
ALTER TABLE public.state_summary REPLICA IDENTITY FULL;
DO $$ BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.phone_audit_jobs;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.state_summary;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
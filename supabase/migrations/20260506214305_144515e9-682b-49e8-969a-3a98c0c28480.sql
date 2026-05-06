ALTER TABLE public.scheduled_sms_jobs REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.scheduled_sms_jobs;
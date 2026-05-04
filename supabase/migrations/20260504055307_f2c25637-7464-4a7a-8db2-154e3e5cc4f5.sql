CREATE TABLE IF NOT EXISTS public.scheduled_sms_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  send_at timestamptz NOT NULL,
  to_phone text NOT NULL,
  body text NOT NULL,
  customer_id uuid,
  source text,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  sent_at timestamptz,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scheduled_sms_jobs_due_idx
  ON public.scheduled_sms_jobs (status, send_at);

ALTER TABLE public.scheduled_sms_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read scheduled_sms_jobs"
  ON public.scheduled_sms_jobs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert scheduled_sms_jobs"
  ON public.scheduled_sms_jobs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update scheduled_sms_jobs"
  ON public.scheduled_sms_jobs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER scheduled_sms_jobs_updated_at
  BEFORE UPDATE ON public.scheduled_sms_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
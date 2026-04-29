CREATE TABLE IF NOT EXISTS public.twilio_inbound_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event text NOT NULL,
  level text NOT NULL DEFAULT 'info',
  from_number text,
  to_number text,
  message_sid text,
  body text,
  elapsed_ms integer,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS twilio_inbound_logs_created_at_idx
  ON public.twilio_inbound_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS twilio_inbound_logs_sid_idx
  ON public.twilio_inbound_logs (message_sid);

ALTER TABLE public.twilio_inbound_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read twilio inbound logs"
  ON public.twilio_inbound_logs FOR SELECT
  TO authenticated
  USING (true);

ALTER TABLE public.twilio_inbound_logs REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.twilio_inbound_logs;
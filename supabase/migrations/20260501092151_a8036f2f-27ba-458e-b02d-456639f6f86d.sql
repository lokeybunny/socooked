CREATE TABLE IF NOT EXISTS public.missed_call_webhook_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_name text NOT NULL,
  event_stage text NOT NULL,
  call_sid text,
  dial_call_sid text,
  phone_number text,
  to_number text,
  forwarded_phone_number text,
  twilio_phone_sid text,
  dial_status text,
  is_missed boolean,
  call_log_id uuid,
  missed_call_event_id uuid,
  call_log_created boolean NOT NULL DEFAULT false,
  missed_call_row_created boolean NOT NULL DEFAULT false,
  error_message text,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_missed_call_webhook_audit_created_at
  ON public.missed_call_webhook_audit (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_missed_call_webhook_audit_call_sid
  ON public.missed_call_webhook_audit (call_sid);

CREATE INDEX IF NOT EXISTS idx_missed_call_webhook_audit_dial_call_sid
  ON public.missed_call_webhook_audit (dial_call_sid);

ALTER TABLE public.missed_call_webhook_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Signed-in users can view missed-call audit logs"
  ON public.missed_call_webhook_audit;

CREATE POLICY "Signed-in users can view missed-call audit logs"
  ON public.missed_call_webhook_audit
  FOR SELECT
  TO authenticated
  USING (true);
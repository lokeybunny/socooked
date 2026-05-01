-- Allow inbound forwarded calls to live in powerdial_call_logs without a campaign
ALTER TABLE public.powerdial_call_logs ALTER COLUMN campaign_id DROP NOT NULL;

-- Add missed-call columns
ALTER TABLE public.powerdial_call_logs
  ADD COLUMN IF NOT EXISTS missed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS answered boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dial_call_status text,
  ADD COLUMN IF NOT EXISTS parent_call_sid text,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS from_number text,
  ADD COLUMN IF NOT EXISTS to_number text;

CREATE INDEX IF NOT EXISTS idx_powerdial_call_logs_parent_sid ON public.powerdial_call_logs(parent_call_sid);
CREATE INDEX IF NOT EXISTS idx_powerdial_call_logs_missed ON public.powerdial_call_logs(missed, created_at DESC) WHERE missed = true;

-- Missed-call events
CREATE TABLE IF NOT EXISTS public.missed_call_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_log_id uuid REFERENCES public.powerdial_call_logs(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  phone_number text NOT NULL,
  phone_last10 text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  callback_status text NOT NULL DEFAULT 'open',
  auto_reply_sent boolean NOT NULL DEFAULT false,
  auto_reply_message text,
  auto_reply_communication_id uuid REFERENCES public.communications(id) ON DELETE SET NULL,
  voidfix_message_id text,
  error_message text,
  campaign_source text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_missed_calls_phone10 ON public.missed_call_events(phone_last10, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_missed_calls_callback_status ON public.missed_call_events(callback_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_missed_calls_customer ON public.missed_call_events(customer_id, created_at DESC);

ALTER TABLE public.missed_call_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view missed call events"
  ON public.missed_call_events FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert missed call events"
  ON public.missed_call_events FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update missed call events"
  ON public.missed_call_events FOR UPDATE
  TO authenticated
  USING (true);

CREATE TRIGGER missed_call_events_updated_at
  BEFORE UPDATE ON public.missed_call_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
-- Permanent sent log: any contact confirmed-successful (email or sms) is recorded
-- here forever and will never be re-targeted by Campaign Leader.
CREATE TABLE IF NOT EXISTS public.campaign_sent_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  phone_e164 text,
  channel text NOT NULL CHECK (channel IN ('email','sms')),
  contact_id uuid,
  lead_id uuid,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS campaign_sent_log_email_channel_uniq
  ON public.campaign_sent_log (lower(email), channel) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS campaign_sent_log_phone_channel_uniq
  ON public.campaign_sent_log (phone_e164, channel) WHERE phone_e164 IS NOT NULL;
CREATE INDEX IF NOT EXISTS campaign_sent_log_email_idx ON public.campaign_sent_log (lower(email));
CREATE INDEX IF NOT EXISTS campaign_sent_log_phone_idx ON public.campaign_sent_log (phone_e164);

ALTER TABLE public.campaign_sent_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read sent log"
  ON public.campaign_sent_log FOR SELECT TO authenticated USING (true);

-- Stop signal + drain status flags on settings (drain loop checks stop_requested)
ALTER TABLE public.campaign_settings
  ADD COLUMN IF NOT EXISTS stop_requested boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS drain_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS drain_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS drain_last_tick_at timestamptz;
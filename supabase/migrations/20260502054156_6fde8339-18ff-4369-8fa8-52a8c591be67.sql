-- Extend drop_campaigns with new settings fields
ALTER TABLE public.drop_campaigns
  ADD COLUMN IF NOT EXISTS default_caller_id text,
  ADD COLUMN IF NOT EXISTS webhook_url text,
  ADD COLUMN IF NOT EXISTS delivery_tracking_enabled boolean NOT NULL DEFAULT true;

-- Create dropco_logs for inbound delivery webhook events
CREATE TABLE IF NOT EXISTS public.dropco_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid,
  customer_id uuid,
  phone text,
  campaign_id text,
  campaign_token text,
  status text NOT NULL,
  activity_token text,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dropco_logs_phone ON public.dropco_logs (phone);
CREATE INDEX IF NOT EXISTS idx_dropco_logs_status ON public.dropco_logs (status);
CREATE INDEX IF NOT EXISTS idx_dropco_logs_created_at ON public.dropco_logs (created_at DESC);

ALTER TABLE public.dropco_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view dropco_logs"
  ON public.dropco_logs FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Service role can insert dropco_logs"
  ON public.dropco_logs FOR INSERT
  TO service_role WITH CHECK (true);

-- LeadsRain campaigns: references to pre-built campaigns in LeadsRain dashboard
CREATE TABLE public.leadsrain_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_name text NOT NULL,
  caller_id text,
  audio_url text,
  transfer_number text,
  is_active boolean NOT NULL DEFAULT false,
  provider_campaign_id text,
  provider_list_id text,
  raw_response jsonb,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.leadsrain_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read campaigns"
  ON public.leadsrain_campaigns FOR SELECT
  TO authenticated USING (true);

CREATE TRIGGER leadsrain_campaigns_updated_at
  BEFORE UPDATE ON public.leadsrain_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- LeadsRain settings: singleton global config
CREATE TABLE public.leadsrain_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  default_campaign_id uuid REFERENCES public.leadsrain_campaigns(id) ON DELETE SET NULL,
  default_caller_id text,
  enable_voidfix_followup boolean NOT NULL DEFAULT true,
  voidfix_template text NOT NULL DEFAULT 'Hey, this is Warren — just left you a quick voicemail.',
  enable_transfer boolean NOT NULL DEFAULT false,
  transfer_number text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.leadsrain_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read settings"
  ON public.leadsrain_settings FOR SELECT
  TO authenticated USING (true);

CREATE TRIGGER leadsrain_settings_updated_at
  BEFORE UPDATE ON public.leadsrain_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.leadsrain_settings (singleton) VALUES (true);

-- LeadsRain drops: per-send log
CREATE TABLE public.leadsrain_drops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid,
  customer_id uuid,
  campaign_id uuid REFERENCES public.leadsrain_campaigns(id) ON DELETE SET NULL,
  phone_number text NOT NULL,
  caller_id text,
  status text NOT NULL DEFAULT 'queued',
  provider_lead_id text,
  provider_campaign_id text,
  provider_list_id text,
  provider_activity_id text,
  status_url text,
  error_message text,
  voidfix_sms_sent_at timestamptz,
  voidfix_sms_message_id text,
  voidfix_sms_error text,
  raw_request jsonb,
  raw_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_leadsrain_drops_phone ON public.leadsrain_drops(phone_number);
CREATE INDEX idx_leadsrain_drops_status ON public.leadsrain_drops(status);
CREATE INDEX idx_leadsrain_drops_created_at ON public.leadsrain_drops(created_at DESC);
CREATE INDEX idx_leadsrain_drops_provider_lead ON public.leadsrain_drops(provider_lead_id) WHERE provider_lead_id IS NOT NULL;
CREATE INDEX idx_leadsrain_drops_customer ON public.leadsrain_drops(customer_id) WHERE customer_id IS NOT NULL;

ALTER TABLE public.leadsrain_drops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read drops"
  ON public.leadsrain_drops FOR SELECT
  TO authenticated USING (true);

CREATE TRIGGER leadsrain_drops_updated_at
  BEFORE UPDATE ON public.leadsrain_drops
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Lead timeline events
CREATE TABLE public.lead_timeline_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid,
  customer_id uuid,
  event_type text NOT NULL,
  event_title text NOT NULL,
  event_description text,
  provider text,
  provider_record_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_timeline_lead ON public.lead_timeline_events(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX idx_lead_timeline_customer ON public.lead_timeline_events(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX idx_lead_timeline_created ON public.lead_timeline_events(created_at DESC);

ALTER TABLE public.lead_timeline_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read timeline"
  ON public.lead_timeline_events FOR SELECT
  TO authenticated USING (true);

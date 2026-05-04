-- 1. Extend state_leads with email + personalization fields
ALTER TABLE public.state_leads
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS property_address text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS zip text,
  ADD COLUMN IF NOT EXISTS last_contacted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_state_leads_email ON public.state_leads(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_state_leads_last_contacted ON public.state_leads(last_contacted_at);

-- 2. campaign_contacts pipeline tracker
CREATE TABLE IF NOT EXISTS public.campaign_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.state_leads(id) ON DELETE SET NULL,
  phone_e164 text,
  email text,
  first_name text,
  state text,
  city text,
  property_address text,
  campaign_date date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Los_Angeles')::date,
  status text NOT NULL DEFAULT 'queued',
  email_status text,
  sms_status text,
  email_sent_at timestamptz,
  sms_sent_at timestamptz,
  last_step text,
  error_message text,
  email_variant int,
  sms_variant int,
  retry_count int NOT NULL DEFAULT 0,
  is_test boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaign_contacts_status ON public.campaign_contacts(status);
CREATE INDEX IF NOT EXISTS idx_campaign_contacts_date ON public.campaign_contacts(campaign_date);
CREATE INDEX IF NOT EXISTS idx_campaign_contacts_email ON public.campaign_contacts(email);
CREATE INDEX IF NOT EXISTS idx_campaign_contacts_phone ON public.campaign_contacts(phone_e164);

ALTER TABLE public.campaign_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read campaign_contacts" ON public.campaign_contacts
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert campaign_contacts" ON public.campaign_contacts
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update campaign_contacts" ON public.campaign_contacts
  FOR UPDATE TO authenticated USING (true);

CREATE TRIGGER trg_campaign_contacts_updated
  BEFORE UPDATE ON public.campaign_contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. suppression_list
CREATE TABLE IF NOT EXISTS public.suppression_list (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  phone_e164 text,
  reason text,
  source text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_suppression_email ON public.suppression_list(email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_suppression_phone ON public.suppression_list(phone_e164) WHERE phone_e164 IS NOT NULL;

ALTER TABLE public.suppression_list ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can suppress (STOP replies)" ON public.suppression_list
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Authenticated read suppression" ON public.suppression_list
  FOR SELECT TO authenticated USING (true);

-- 4. campaign_settings (single row config)
CREATE TABLE IF NOT EXISTS public.campaign_settings (
  id int PRIMARY KEY DEFAULT 1,
  is_production boolean NOT NULL DEFAULT false,
  is_paused boolean NOT NULL DEFAULT true,
  daily_email_cap int NOT NULL DEFAULT 3000,
  daily_sms_cap int NOT NULL DEFAULT 3000,
  batch_size int NOT NULL DEFAULT 50,
  min_delay_seconds int NOT NULL DEFAULT 30,
  max_delay_seconds int NOT NULL DEFAULT 120,
  start_hour_pt int NOT NULL DEFAULT 9,
  end_hour_pt int NOT NULL DEFAULT 17,
  failure_threshold_pct int NOT NULL DEFAULT 20,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);

INSERT INTO public.campaign_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

ALTER TABLE public.campaign_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read settings" ON public.campaign_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated update settings" ON public.campaign_settings
  FOR UPDATE TO authenticated USING (true);

-- 5. campaign_daily_stats
CREATE TABLE IF NOT EXISTS public.campaign_daily_stats (
  campaign_date date PRIMARY KEY DEFAULT (now() AT TIME ZONE 'America/Los_Angeles')::date,
  emails_sent int NOT NULL DEFAULT 0,
  emails_failed int NOT NULL DEFAULT 0,
  sms_sent int NOT NULL DEFAULT 0,
  sms_failed int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.campaign_daily_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read daily stats" ON public.campaign_daily_stats
  FOR SELECT TO authenticated USING (true);

-- 6. campaign_activity_log for live feed
CREATE TABLE IF NOT EXISTS public.campaign_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES public.campaign_contacts(id) ON DELETE CASCADE,
  level text NOT NULL DEFAULT 'info',
  step text,
  message text,
  meta jsonb DEFAULT '{}'::jsonb,
  is_test boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_created ON public.campaign_activity_log(created_at DESC);

ALTER TABLE public.campaign_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read activity" ON public.campaign_activity_log
  FOR SELECT TO authenticated USING (true);

-- 7. Realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.campaign_contacts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.campaign_activity_log;
ALTER PUBLICATION supabase_realtime ADD TABLE public.campaign_daily_stats;
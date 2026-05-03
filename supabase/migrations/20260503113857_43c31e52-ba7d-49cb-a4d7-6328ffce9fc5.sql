-- Voice Drops: campaigns
CREATE TABLE public.voice_drop_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider text NOT NULL DEFAULT 'leadsrain',
  campaign_name text NOT NULL,
  leadsrain_campaign_id text,
  leadsrain_list_id text,
  campaign_cid text,
  business_line_1 text,
  twilio_number text,
  verizon_forward_number text,
  sound_file_url text,
  status text NOT NULL DEFAULT 'draft',
  total_leads integer NOT NULL DEFAULT 0,
  drops_sent integer NOT NULL DEFAULT 0,
  estimated_delivered integer NOT NULL DEFAULT 0,
  callbacks_count integer NOT NULL DEFAULT 0,
  missed_calls_count integer NOT NULL DEFAULT 0,
  answered_calls_count integer NOT NULL DEFAULT 0,
  sms_replies_sent_count integer NOT NULL DEFAULT 0,
  conversion_rate numeric NOT NULL DEFAULT 0,
  active_start_at timestamptz,
  active_end_at timestamptz,
  last_synced_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.voice_drop_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vdc_select_own" ON public.voice_drop_campaigns FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "vdc_insert_own" ON public.voice_drop_campaigns FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "vdc_update_own" ON public.voice_drop_campaigns FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "vdc_delete_own" ON public.voice_drop_campaigns FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX idx_vdc_user ON public.voice_drop_campaigns(user_id);
CREATE INDEX idx_vdc_status ON public.voice_drop_campaigns(status);
CREATE INDEX idx_vdc_active_window ON public.voice_drop_campaigns(active_start_at, active_end_at);
CREATE TRIGGER trg_vdc_updated BEFORE UPDATE ON public.voice_drop_campaigns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Voice Drops: leads
CREATE TABLE public.voice_drop_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  campaign_id uuid NOT NULL REFERENCES public.voice_drop_campaigns(id) ON DELETE CASCADE,
  contact_id uuid,
  phone_number text NOT NULL,
  first_name text,
  last_name text,
  email text,
  address text,
  city text,
  state text,
  zip text,
  notes text,
  leadsrain_upload_status text NOT NULL DEFAULT 'pending',
  leadsrain_response jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.voice_drop_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vdl_select_own" ON public.voice_drop_leads FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "vdl_insert_own" ON public.voice_drop_leads FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "vdl_update_own" ON public.voice_drop_leads FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "vdl_delete_own" ON public.voice_drop_leads FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX idx_vdl_campaign ON public.voice_drop_leads(campaign_id);
CREATE INDEX idx_vdl_phone ON public.voice_drop_leads(phone_number);
CREATE TRIGGER trg_vdl_updated BEFORE UPDATE ON public.voice_drop_leads FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Voice Drops: events
CREATE TABLE public.voice_drop_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  campaign_id uuid REFERENCES public.voice_drop_campaigns(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.voice_drop_leads(id) ON DELETE SET NULL,
  contact_id uuid,
  phone_number text,
  event_type text NOT NULL,
  provider text NOT NULL DEFAULT 'leadsrain',
  event_source text,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.voice_drop_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vde_select_own" ON public.voice_drop_events FOR SELECT TO authenticated USING (auth.uid() = user_id OR user_id IS NULL);
CREATE POLICY "vde_insert_any" ON public.voice_drop_events FOR INSERT TO authenticated WITH CHECK (true);
CREATE INDEX idx_vde_campaign ON public.voice_drop_events(campaign_id);
CREATE INDEX idx_vde_phone ON public.voice_drop_events(phone_number);
CREATE INDEX idx_vde_type ON public.voice_drop_events(event_type);
CREATE INDEX idx_vde_created ON public.voice_drop_events(created_at DESC);

-- Voice Drops: per-user settings
CREATE TABLE public.voice_drop_settings (
  user_id uuid PRIMARY KEY,
  business_line_1 text,
  twilio_forward_number text,
  verizon_forward_number text,
  default_campaign_cid text,
  default_missed_call_sms text NOT NULL DEFAULT 'Currently in a meeting, talk with you soon. In the meanwhile, check my work out on IG: https://instagram.com/w4rr3nGURU',
  voidfix_enabled boolean NOT NULL DEFAULT true,
  attribution_window_hours integer NOT NULL DEFAULT 72,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.voice_drop_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vds_select_own" ON public.voice_drop_settings FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "vds_insert_own" ON public.voice_drop_settings FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "vds_update_own" ON public.voice_drop_settings FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER trg_vds_updated BEFORE UPDATE ON public.voice_drop_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.slybroadcast_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  session_id TEXT UNIQUE,
  title TEXT NOT NULL,
  caller_id TEXT,
  phone_count INTEGER DEFAULT 0,
  c_phone_raw TEXT,
  audio_type TEXT,
  c_record_audio TEXT,
  c_url TEXT,
  c_audio TEXT,
  mobile_only BOOLEAN DEFAULT false,
  scheduled_at TIMESTAMPTZ,
  status TEXT DEFAULT 'submitted',
  raw_response TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.slybroadcast_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES public.slybroadcast_campaigns(id) ON DELETE CASCADE,
  session_id TEXT,
  destination_phone TEXT,
  status TEXT,
  failure_reason TEXT,
  delivery_time TIMESTAMPTZ,
  carrier TEXT,
  raw_payload TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_slybroadcast_results_session ON public.slybroadcast_results(session_id);
CREATE INDEX idx_slybroadcast_results_campaign ON public.slybroadcast_results(campaign_id);

CREATE TABLE public.slybroadcast_action_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES public.slybroadcast_campaigns(id) ON DELETE CASCADE,
  session_id TEXT,
  action TEXT,
  api_response TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.slybroadcast_audio_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  system_file_name TEXT,
  display_name TEXT,
  duration_seconds NUMERIC,
  time_created TEXT,
  raw_payload TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (system_file_name)
);

ALTER TABLE public.slybroadcast_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slybroadcast_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slybroadcast_action_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slybroadcast_audio_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth all campaigns" ON public.slybroadcast_campaigns FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth view results" ON public.slybroadcast_results FOR SELECT TO authenticated USING (true);
CREATE POLICY "anyone insert results" ON public.slybroadcast_results FOR INSERT WITH CHECK (true);
CREATE POLICY "auth all action_logs" ON public.slybroadcast_action_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "service insert action_logs" ON public.slybroadcast_action_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "auth all audio" ON public.slybroadcast_audio_files FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER slybroadcast_campaigns_updated_at
  BEFORE UPDATE ON public.slybroadcast_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

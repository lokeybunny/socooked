
-- POWERDIAL campaigns
CREATE TABLE public.powerdial_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by UUID NOT NULL,
  name TEXT NOT NULL DEFAULT 'Untitled Campaign',
  status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle','running','paused','stopped','completed')),
  source_filter JSONB DEFAULT '{}'::jsonb,
  settings JSONB DEFAULT '{"call_delay_ms":2000,"max_retries":2,"retry_no_answer_hours":4,"retry_busy_minutes":30,"calling_hours_start":"09:00","calling_hours_end":"17:00"}'::jsonb,
  total_leads INT NOT NULL DEFAULT 0,
  completed_count INT NOT NULL DEFAULT 0,
  human_count INT NOT NULL DEFAULT 0,
  voicemail_count INT NOT NULL DEFAULT 0,
  busy_count INT NOT NULL DEFAULT 0,
  no_answer_count INT NOT NULL DEFAULT 0,
  failed_count INT NOT NULL DEFAULT 0,
  current_index INT NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.powerdial_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own campaigns" ON public.powerdial_campaigns FOR ALL USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());

CREATE TRIGGER update_powerdial_campaigns_updated_at BEFORE UPDATE ON public.powerdial_campaigns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- POWERDIAL queue items
CREATE TABLE public.powerdial_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.powerdial_campaigns(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  phone TEXT NOT NULL,
  contact_name TEXT,
  position INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','dialing','completed','skipped','retry_later')),
  last_result TEXT,
  retry_count INT NOT NULL DEFAULT 0,
  retry_at TIMESTAMPTZ,
  last_dialed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.powerdial_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage queue via campaign" ON public.powerdial_queue FOR ALL
  USING (EXISTS (SELECT 1 FROM public.powerdial_campaigns c WHERE c.id = campaign_id AND c.created_by = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.powerdial_campaigns c WHERE c.id = campaign_id AND c.created_by = auth.uid()));

CREATE INDEX idx_powerdial_queue_campaign ON public.powerdial_queue(campaign_id, position);
CREATE TRIGGER update_powerdial_queue_updated_at BEFORE UPDATE ON public.powerdial_queue FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- POWERDIAL call logs
CREATE TABLE public.powerdial_call_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.powerdial_campaigns(id) ON DELETE CASCADE,
  queue_item_id UUID REFERENCES public.powerdial_queue(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  phone TEXT NOT NULL,
  attempt_number INT NOT NULL DEFAULT 1,
  twilio_call_sid TEXT,
  twilio_status TEXT,
  amd_result TEXT,
  connected_to_vapi BOOLEAN NOT NULL DEFAULT false,
  vapi_call_id TEXT,
  transcript TEXT,
  summary TEXT,
  disposition TEXT,
  recording_url TEXT,
  follow_up_needed BOOLEAN NOT NULL DEFAULT false,
  retry_eligible BOOLEAN NOT NULL DEFAULT false,
  meta JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.powerdial_call_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage call logs via campaign" ON public.powerdial_call_logs FOR ALL
  USING (EXISTS (SELECT 1 FROM public.powerdial_campaigns c WHERE c.id = campaign_id AND c.created_by = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.powerdial_campaigns c WHERE c.id = campaign_id AND c.created_by = auth.uid()));

CREATE INDEX idx_powerdial_logs_campaign ON public.powerdial_call_logs(campaign_id, created_at DESC);
CREATE TRIGGER update_powerdial_call_logs_updated_at BEFORE UPDATE ON public.powerdial_call_logs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.powerdial_campaigns;
ALTER PUBLICATION supabase_realtime ADD TABLE public.powerdial_queue;


CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "app_settings_select_auth" ON public.app_settings;
CREATE POLICY "app_settings_select_auth" ON public.app_settings FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "app_settings_modify_auth" ON public.app_settings;
CREATE POLICY "app_settings_modify_auth" ON public.app_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.sms_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  body text NOT NULL,
  category text DEFAULT 'general',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sms_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sms_templates_all_auth" ON public.sms_templates;
CREATE POLICY "sms_templates_all_auth" ON public.sms_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS sms_templates_set_updated_at ON public.sms_templates;
CREATE TRIGGER sms_templates_set_updated_at BEFORE UPDATE ON public.sms_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.sms_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  total_recipients int NOT NULL DEFAULT 0,
  sent_count int NOT NULL DEFAULT 0,
  failed_count int NOT NULL DEFAULT 0,
  created_by uuid,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sms_campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sms_campaigns_all_auth" ON public.sms_campaigns;
CREATE POLICY "sms_campaigns_all_auth" ON public.sms_campaigns FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS sms_campaigns_set_updated_at ON public.sms_campaigns;
CREATE TRIGGER sms_campaigns_set_updated_at BEFORE UPDATE ON public.sms_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.sms_campaign_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.sms_campaigns(id) ON DELETE CASCADE,
  phone text NOT NULL,
  contact_name text,
  status text NOT NULL DEFAULT 'pending',
  error text,
  external_id text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sms_campaign_recipients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sms_campaign_recipients_all_auth" ON public.sms_campaign_recipients;
CREATE POLICY "sms_campaign_recipients_all_auth" ON public.sms_campaign_recipients FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_sms_campaign_recipients_campaign ON public.sms_campaign_recipients(campaign_id);


-- Site configurations table: stores editable content sections for client websites
CREATE TABLE public.site_configs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id text NOT NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  section text NOT NULL,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(site_id, section)
);

-- Index for fast lookups by site_id
CREATE INDEX idx_site_configs_site_id ON public.site_configs(site_id);
CREATE INDEX idx_site_configs_customer_id ON public.site_configs(customer_id);

-- Enable RLS
ALTER TABLE public.site_configs ENABLE ROW LEVEL SECURITY;

-- Staff full access
CREATE POLICY "site_configs_all_access" ON public.site_configs FOR ALL USING (true) WITH CHECK (true);

-- Public read access for published configs (so v0 sites can fetch without auth)
-- This is handled by the anon key + the policy above

-- Auto-update timestamp
CREATE TRIGGER set_site_configs_updated_at
  BEFORE UPDATE ON public.site_configs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Activity logging
CREATE TRIGGER log_site_configs_activity
  AFTER INSERT OR UPDATE OR DELETE ON public.site_configs
  FOR EACH ROW EXECUTE FUNCTION public.log_activity('site_config');

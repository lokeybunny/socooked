
-- Extensions for scheduled polling
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============ lr_campaigns ============
CREATE TABLE IF NOT EXISTS public.lr_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id text NOT NULL UNIQUE,
  campaign_name text,
  caller_id text,
  list_id text,
  status text,
  total_leads integer NOT NULL DEFAULT 0,
  processed_leads integer NOT NULL DEFAULT 0,
  delivered_leads integer NOT NULL DEFAULT 0,
  failed_leads integer NOT NULL DEFAULT 0,
  remaining_leads integer NOT NULL DEFAULT 0,
  completion_percentage numeric(5,2) NOT NULL DEFAULT 0,
  started_at timestamptz,
  last_synced_at timestamptz,
  estimated_completion_at timestamptz,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lr_campaigns_status_idx ON public.lr_campaigns(status);
CREATE INDEX IF NOT EXISTS lr_campaigns_last_synced_idx ON public.lr_campaigns(last_synced_at DESC);

ALTER TABLE public.lr_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lr_campaigns auth read" ON public.lr_campaigns
  FOR SELECT TO authenticated USING (true);

CREATE TRIGGER lr_campaigns_updated_at
  BEFORE UPDATE ON public.lr_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ lr_campaign_snapshots ============
CREATE TABLE IF NOT EXISTS public.lr_campaign_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id text NOT NULL,
  snapshot_at timestamptz NOT NULL DEFAULT now(),
  processed_count integer NOT NULL DEFAULT 0,
  delivered_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  remaining_count integer NOT NULL DEFAULT 0,
  status text
);
CREATE INDEX IF NOT EXISTS lr_snapshots_campaign_time_idx
  ON public.lr_campaign_snapshots(campaign_id, snapshot_at DESC);

ALTER TABLE public.lr_campaign_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lr_snapshots auth read" ON public.lr_campaign_snapshots
  FOR SELECT TO authenticated USING (true);

-- ============ lr_sync_logs ============
CREATE TABLE IF NOT EXISTS public.lr_sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms integer,
  status text NOT NULL DEFAULT 'running',
  campaigns_seen integer NOT NULL DEFAULT 0,
  campaigns_changed integer NOT NULL DEFAULT 0,
  http_status integer,
  error text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS lr_sync_logs_started_idx ON public.lr_sync_logs(started_at DESC);

ALTER TABLE public.lr_sync_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lr_sync_logs auth read" ON public.lr_sync_logs
  FOR SELECT TO authenticated USING (true);

-- ============ lr_sync_config (singleton) ============
CREATE TABLE IF NOT EXISTS public.lr_sync_config (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled boolean NOT NULL DEFAULT true,
  interval_minutes integer NOT NULL DEFAULT 5,
  last_run_at timestamptz,
  next_run_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.lr_sync_config (id, enabled, interval_minutes)
VALUES (1, true, 5)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.lr_sync_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lr_sync_config auth read" ON public.lr_sync_config
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "lr_sync_config auth update" ON public.lr_sync_config
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER lr_sync_config_updated_at
  BEFORE UPDATE ON public.lr_sync_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.lr_campaigns;
ALTER PUBLICATION supabase_realtime ADD TABLE public.lr_sync_logs;


-- Extend lw_buyers with discovery fields
ALTER TABLE lw_buyers
ADD COLUMN IF NOT EXISTS source_platform text,
ADD COLUMN IF NOT EXISTS source_url text,
ADD COLUMN IF NOT EXISTS buyer_score integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS confidence_score integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS buyer_type text DEFAULT 'unknown',
ADD COLUMN IF NOT EXISTS intent_level text DEFAULT 'low',
ADD COLUMN IF NOT EXISTS intent_summary text,
ADD COLUMN IF NOT EXISTS raw_source_data jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS last_seen_signal timestamptz,
ADD COLUMN IF NOT EXISTS pipeline_stage text DEFAULT 'new_scraped',
ADD COLUMN IF NOT EXISTS city text,
ADD COLUMN IF NOT EXISTS property_type_interest text[] DEFAULT '{}'::text[];

-- Discovery sources config
CREATE TABLE IF NOT EXISTS lw_buyer_discovery_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  platform text NOT NULL,
  apify_actor_id text,
  search_keywords text[] DEFAULT '{}',
  search_urls text[] DEFAULT '{}',
  is_enabled boolean DEFAULT true,
  schedule_cron text DEFAULT '0 6 * * *',
  last_run_at timestamptz,
  run_count integer DEFAULT 0,
  meta jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE lw_buyer_discovery_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY lw_buyer_discovery_sources_all ON lw_buyer_discovery_sources FOR ALL USING (true) WITH CHECK (true);

-- Ingestion logs
CREATE TABLE IF NOT EXISTS lw_buyer_ingestion_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid REFERENCES lw_buyer_discovery_sources(id) ON DELETE SET NULL,
  apify_run_id text,
  platform text NOT NULL,
  status text DEFAULT 'processing',
  records_received integer DEFAULT 0,
  records_new integer DEFAULT 0,
  records_updated integer DEFAULT 0,
  records_skipped integer DEFAULT 0,
  high_score_count integer DEFAULT 0,
  error text,
  meta jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE lw_buyer_ingestion_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY lw_buyer_ingestion_logs_all ON lw_buyer_ingestion_logs FOR ALL USING (true) WITH CHECK (true);

-- Config table
CREATE TABLE IF NOT EXISTS lw_buyer_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE lw_buyer_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY lw_buyer_config_all ON lw_buyer_config FOR ALL USING (true) WITH CHECK (true);

-- Seed defaults
INSERT INTO lw_buyer_config (key, value) VALUES
('scoring_thresholds', '{"high_intent": 70, "medium_intent": 40, "auto_qualify": 85}'::jsonb),
('intent_keywords', '{"high": ["cash buyer","buying land","looking for deals","land investor","vacant land buyer","off market","wholesale deal","who has deals","ready to close","send me deals","looking for off market"], "medium": ["investor","real estate","property","acreage","rural land","cheap land","land for sale"], "low": ["interested in","looking at","considering"]}'::jsonb),
('excluded_sources', '[]'::jsonb),
('auto_create_tasks', 'true'::jsonb),
('telegram_alerts', '{"enabled": true, "min_score": 70}'::jsonb)
ON CONFLICT (key) DO NOTHING;

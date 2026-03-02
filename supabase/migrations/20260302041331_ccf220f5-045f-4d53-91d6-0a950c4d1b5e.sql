
-- Market cap alerts table
CREATE TABLE public.market_cap_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ca_address TEXT NOT NULL,
  token_name TEXT,
  token_symbol TEXT,
  milestone TEXT NOT NULL DEFAULT '30k',
  milestone_value INTEGER NOT NULL DEFAULT 30000,
  raw_message TEXT,
  source_url TEXT,
  media_url TEXT,
  is_j7tracker BOOLEAN NOT NULL DEFAULT false,
  audit_status TEXT NOT NULL DEFAULT 'pending',
  audit_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  verdict TEXT,
  telegram_channel_id BIGINT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX idx_mca_ca ON public.market_cap_alerts (ca_address);
CREATE INDEX idx_mca_milestone ON public.market_cap_alerts (milestone_value DESC);
CREATE INDEX idx_mca_created ON public.market_cap_alerts (created_at DESC);

-- RLS
ALTER TABLE public.market_cap_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "market_cap_alerts_all_access" ON public.market_cap_alerts FOR ALL USING (true) WITH CHECK (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.market_cap_alerts;

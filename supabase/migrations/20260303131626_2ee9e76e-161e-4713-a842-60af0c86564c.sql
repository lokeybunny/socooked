-- Add is_top_gainer flag to market_cap_alerts
ALTER TABLE public.market_cap_alerts 
ADD COLUMN is_top_gainer boolean NOT NULL DEFAULT false;

-- Index for efficient querying
CREATE INDEX idx_market_cap_alerts_top_gainer ON public.market_cap_alerts (is_top_gainer) WHERE is_top_gainer = true;
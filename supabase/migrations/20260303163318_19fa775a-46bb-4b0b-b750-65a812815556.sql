-- Remove duplicate rows keeping the oldest per (ca_address, milestone)
DELETE FROM public.market_cap_alerts
WHERE id NOT IN (
  SELECT DISTINCT ON (ca_address, milestone) id
  FROM public.market_cap_alerts
  ORDER BY ca_address, milestone, created_at ASC
);

-- Now create unique index
CREATE UNIQUE INDEX idx_market_cap_alerts_ca_milestone 
ON public.market_cap_alerts (ca_address, milestone);
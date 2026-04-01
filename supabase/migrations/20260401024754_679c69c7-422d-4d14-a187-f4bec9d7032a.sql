
CREATE TABLE public.stale_zillow_leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  zpid TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  listed_price NUMERIC,
  zestimate NUMERIC,
  days_on_zillow INTEGER,
  bedrooms INTEGER,
  bathrooms NUMERIC,
  sqft INTEGER,
  lot_sqft INTEGER,
  year_built INTEGER,
  home_type TEXT,
  home_status TEXT,
  zillow_url TEXT,
  agent_name TEXT,
  agent_phone TEXT,
  brokerage TEXT,
  price_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_price_drop_percent NUMERIC,
  price_drop_count INTEGER DEFAULT 0,
  date_posted TIMESTAMP WITH TIME ZONE,
  flagged BOOLEAN NOT NULL DEFAULT false,
  user_notes TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  apify_run_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.stale_zillow_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stale_zillow_leads_auth_access"
ON public.stale_zillow_leads
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

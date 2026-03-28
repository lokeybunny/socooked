
-- Land Wholesaling tables with deal_type (land/home) filter

CREATE TABLE public.lw_buyers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text,
  phone text,
  entity_name text,
  source text NOT NULL DEFAULT 'manual',
  deal_type text NOT NULL DEFAULT 'land',
  target_counties text[] NOT NULL DEFAULT '{}',
  target_states text[] NOT NULL DEFAULT '{}',
  target_zoning text[] DEFAULT '{}',
  acreage_min numeric DEFAULT 0,
  acreage_max numeric,
  budget_min numeric DEFAULT 0,
  budget_max numeric,
  activity_score integer NOT NULL DEFAULT 0,
  last_purchase_date date,
  purchase_count integer DEFAULT 0,
  tags text[] DEFAULT '{}',
  notes text,
  status text NOT NULL DEFAULT 'active',
  reapi_owner_id text,
  meta jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX lw_buyers_phone_uniq ON public.lw_buyers(phone) WHERE phone IS NOT NULL;

CREATE TABLE public.lw_sellers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_name text,
  owner_phone text,
  owner_email text,
  owner_mailing_address text,
  deal_type text NOT NULL DEFAULT 'land',
  reapi_property_id text,
  apn text,
  fips text,
  address_full text,
  city text,
  state text,
  zip text,
  county text,
  acreage numeric,
  lot_sqft integer,
  zoning text,
  property_type text DEFAULT 'VAC',
  is_absentee_owner boolean DEFAULT false,
  is_out_of_state boolean DEFAULT false,
  is_tax_delinquent boolean DEFAULT false,
  tax_delinquent_year text,
  has_tax_lien boolean DEFAULT false,
  is_vacant boolean DEFAULT false,
  is_pre_foreclosure boolean DEFAULT false,
  is_corporate_owned boolean DEFAULT false,
  years_owned integer,
  assessed_value numeric,
  market_value numeric,
  asking_price numeric,
  estimated_offer numeric,
  motivation_score integer NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'reapi',
  status text NOT NULL DEFAULT 'new',
  skip_traced_at timestamptz,
  contacted_at timestamptz,
  tags text[] DEFAULT '{}',
  notes text,
  meta jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lw_sellers_county_idx ON public.lw_sellers(county, state);
CREATE INDEX lw_sellers_motivation_idx ON public.lw_sellers(motivation_score DESC);
CREATE UNIQUE INDEX lw_sellers_apn_fips_uniq ON public.lw_sellers(apn, fips) WHERE apn IS NOT NULL AND fips IS NOT NULL;

CREATE TABLE public.lw_deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid REFERENCES public.lw_sellers(id) ON DELETE CASCADE NOT NULL,
  buyer_id uuid REFERENCES public.lw_buyers(id) ON DELETE SET NULL,
  title text NOT NULL,
  deal_type text NOT NULL DEFAULT 'land',
  match_score integer NOT NULL DEFAULT 0,
  seller_ask numeric,
  our_offer numeric,
  buyer_price numeric,
  spread numeric GENERATED ALWAYS AS (COALESCE(buyer_price, 0) - COALESCE(our_offer, 0)) STORED,
  stage text NOT NULL DEFAULT 'matched',
  priority text NOT NULL DEFAULT 'medium',
  assigned_to uuid,
  notes text,
  meta jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.lw_demand_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  county text NOT NULL,
  state text NOT NULL,
  deal_type text NOT NULL DEFAULT 'land',
  buyer_count integer NOT NULL DEFAULT 0,
  avg_budget numeric,
  avg_acreage_min numeric,
  avg_acreage_max numeric,
  zoning_demand jsonb DEFAULT '{}',
  demand_rank integer,
  last_refreshed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(county, state, deal_type)
);

CREATE TABLE public.lw_call_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_date date NOT NULL DEFAULT CURRENT_DATE,
  seller_id uuid REFERENCES public.lw_sellers(id) ON DELETE CASCADE NOT NULL,
  deal_id uuid REFERENCES public.lw_deals(id) ON DELETE SET NULL,
  call_priority integer NOT NULL DEFAULT 99,
  reason text NOT NULL,
  owner_name text,
  owner_phone text,
  property_address text,
  motivation_score integer,
  match_score integer,
  status text NOT NULL DEFAULT 'pending',
  outcome text,
  called_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lw_call_queue_date_idx ON public.lw_call_queue(queue_date, call_priority);

CREATE TABLE public.lw_ingestion_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_type text NOT NULL,
  source text NOT NULL DEFAULT 'reapi',
  records_fetched integer DEFAULT 0,
  records_new integer DEFAULT 0,
  credits_used numeric DEFAULT 0,
  params jsonb DEFAULT '{}',
  status text NOT NULL DEFAULT 'completed',
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- updated_at triggers
CREATE TRIGGER set_lw_buyers_updated_at BEFORE UPDATE ON public.lw_buyers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_lw_sellers_updated_at BEFORE UPDATE ON public.lw_sellers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_lw_deals_updated_at BEFORE UPDATE ON public.lw_deals FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS (internal tool, open access for authenticated)
ALTER TABLE public.lw_buyers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lw_sellers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lw_deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lw_demand_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lw_call_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lw_ingestion_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lw_buyers_all" ON public.lw_buyers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "lw_sellers_all" ON public.lw_sellers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "lw_deals_all" ON public.lw_deals FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "lw_demand_signals_all" ON public.lw_demand_signals FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "lw_call_queue_all" ON public.lw_call_queue FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "lw_ingestion_runs_all" ON public.lw_ingestion_runs FOR ALL USING (true) WITH CHECK (true);

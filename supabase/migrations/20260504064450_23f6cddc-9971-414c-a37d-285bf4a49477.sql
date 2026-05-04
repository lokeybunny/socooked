
-- AgentFlow Engine tables
CREATE TABLE public.target_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location text NOT NULL UNIQUE,
  priority integer NOT NULL DEFAULT 1,
  last_scraped_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.af_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zpid text UNIQUE NOT NULL,
  address text,
  city text,
  state text,
  zip text,
  price numeric,
  listing_url text,
  scraped_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_af_listings_scraped_at ON public.af_listings(scraped_at DESC);
CREATE INDEX idx_af_listings_city ON public.af_listings(city);

CREATE TABLE public.af_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  brokerage text,
  source text NOT NULL DEFAULT 'zillow',
  normalized_key text UNIQUE NOT NULL,
  city text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_af_agents_city ON public.af_agents(city);

CREATE TABLE public.af_agent_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.af_agents(id) ON DELETE CASCADE,
  phone text UNIQUE NOT NULL,
  phone_type text NOT NULL DEFAULT 'unknown',
  is_valid boolean NOT NULL DEFAULT false,
  validated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_af_contacts_agent ON public.af_agent_contacts(agent_id);
CREATE INDEX idx_af_contacts_valid ON public.af_agent_contacts(is_valid, phone_type);
CREATE INDEX idx_af_contacts_validated_at ON public.af_agent_contacts(validated_at DESC);

CREATE TABLE public.af_agent_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.af_agents(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES public.af_listings(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_id, listing_id)
);

CREATE TABLE public.af_scrape_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'pending',
  target_location text,
  pages_scraped integer NOT NULL DEFAULT 0,
  new_listings integer NOT NULL DEFAULT 0,
  new_agents integer NOT NULL DEFAULT 0,
  new_valid_mobiles integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  error_log text
);
CREATE INDEX idx_af_jobs_started ON public.af_scrape_jobs(started_at DESC);

-- Enable RLS
ALTER TABLE public.target_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.af_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.af_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.af_agent_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.af_agent_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.af_scrape_jobs ENABLE ROW LEVEL SECURITY;

-- Authenticated read on all
CREATE POLICY "auth read target_locations" ON public.target_locations FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth read af_listings" ON public.af_listings FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth read af_agents" ON public.af_agents FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth read af_contacts" ON public.af_agent_contacts FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth read af_agent_listings" ON public.af_agent_listings FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth read af_scrape_jobs" ON public.af_scrape_jobs FOR SELECT TO authenticated USING (true);

-- Authenticated manage target_locations (small admin set, gated client-side too)
CREATE POLICY "auth insert target_locations" ON public.target_locations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update target_locations" ON public.target_locations FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth delete target_locations" ON public.target_locations FOR DELETE TO authenticated USING (true);

-- Seed top metros
INSERT INTO public.target_locations (location, priority) VALUES
  ('Los Angeles, CA', 10), ('San Diego, CA', 9), ('San Francisco, CA', 9),
  ('Sacramento, CA', 7), ('San Jose, CA', 8), ('Las Vegas, NV', 9),
  ('Phoenix, AZ', 9), ('Dallas, TX', 9), ('Houston, TX', 9),
  ('Austin, TX', 8), ('San Antonio, TX', 8), ('Atlanta, GA', 9),
  ('Miami, FL', 9), ('Orlando, FL', 8), ('Tampa, FL', 8),
  ('Jacksonville, FL', 7), ('Chicago, IL', 9), ('New York, NY', 10),
  ('Brooklyn, NY', 8), ('Philadelphia, PA', 8), ('Seattle, WA', 8),
  ('Portland, OR', 7), ('Denver, CO', 8), ('Charlotte, NC', 8),
  ('Raleigh, NC', 7), ('Nashville, TN', 8), ('Memphis, TN', 7),
  ('Boston, MA', 8), ('Washington, DC', 8), ('Detroit, MI', 7),
  ('Minneapolis, MN', 7), ('Indianapolis, IN', 7), ('Columbus, OH', 7),
  ('Cleveland, OH', 7), ('Kansas City, MO', 7), ('St Louis, MO', 7),
  ('Salt Lake City, UT', 7), ('Albuquerque, NM', 6), ('Tucson, AZ', 7),
  ('Fresno, CA', 7);

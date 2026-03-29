
-- Landing page configs per client
CREATE TABLE public.lw_landing_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  client_name text NOT NULL,
  tagline text NOT NULL DEFAULT 'We Buy Houses Fast. Cash Offers in 24 Hours.',
  headline text NOT NULL DEFAULT 'Get a Fair Cash Offer for Your Home Today',
  sub_headline text DEFAULT 'No inspections. No appraisals. No hassle. Close on your timeline.',
  photo_url text,
  logo_url text,
  accent_color text NOT NULL DEFAULT '#2563eb',
  phone text,
  email text,
  reviews jsonb NOT NULL DEFAULT '[]'::jsonb,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lw_landing_pages ENABLE ROW LEVEL SECURITY;

-- Auth users can manage
CREATE POLICY "lw_landing_pages_auth_access" ON public.lw_landing_pages
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Public can read active pages
CREATE POLICY "lw_landing_pages_public_read" ON public.lw_landing_pages
  FOR SELECT TO public USING (is_active = true);

-- Seller leads captured from landing pages
CREATE TABLE public.lw_landing_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  landing_page_id uuid REFERENCES public.lw_landing_pages(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  phone text NOT NULL,
  property_address text NOT NULL,
  status text NOT NULL DEFAULT 'new',
  notes text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lw_landing_leads ENABLE ROW LEVEL SECURITY;

-- Auth users can manage all leads
CREATE POLICY "lw_landing_leads_auth_access" ON public.lw_landing_leads
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Public can insert leads (form submissions)
CREATE POLICY "lw_landing_leads_public_insert" ON public.lw_landing_leads
  FOR INSERT TO public WITH CHECK (true);

-- Trigger for updated_at on landing_pages
CREATE TRIGGER set_lw_landing_pages_updated_at
  BEFORE UPDATE ON public.lw_landing_pages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

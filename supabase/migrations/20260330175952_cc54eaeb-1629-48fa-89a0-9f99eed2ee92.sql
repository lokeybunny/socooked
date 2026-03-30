
CREATE TABLE public.apify_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key text NOT NULL,
  label text NOT NULL DEFAULT 'Default',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.apify_blocked_workers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_shortcode text NOT NULL UNIQUE,
  reason text,
  blocked_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.apify_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apify_blocked_workers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read apify_config"
  ON public.apify_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert apify_config"
  ON public.apify_config FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update apify_config"
  ON public.apify_config FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete apify_config"
  ON public.apify_config FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can read apify_blocked_workers"
  ON public.apify_blocked_workers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert apify_blocked_workers"
  ON public.apify_blocked_workers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can delete apify_blocked_workers"
  ON public.apify_blocked_workers FOR DELETE TO authenticated USING (true);

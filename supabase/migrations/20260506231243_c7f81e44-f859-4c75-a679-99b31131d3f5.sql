CREATE TABLE IF NOT EXISTS public.short_links (
  slug text PRIMARY KEY,
  target_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  click_count integer NOT NULL DEFAULT 0
);

ALTER TABLE public.short_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "short_links public read"
  ON public.short_links FOR SELECT
  USING (true);

CREATE POLICY "short_links authenticated insert"
  ON public.short_links FOR INSERT
  TO authenticated
  WITH CHECK (true);
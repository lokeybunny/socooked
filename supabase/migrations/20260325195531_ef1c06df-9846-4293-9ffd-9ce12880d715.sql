
CREATE TABLE public.comm_scrapes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'Unnamed Community',
  community_url text NOT NULL,
  apify_run_id text,
  member_count integer NOT NULL DEFAULT 0,
  members jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'completed',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.comm_scrapes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comm_scrapes_all_access" ON public.comm_scrapes
  FOR ALL TO public USING (true) WITH CHECK (true);

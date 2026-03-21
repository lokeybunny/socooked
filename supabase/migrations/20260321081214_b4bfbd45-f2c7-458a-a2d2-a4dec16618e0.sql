CREATE TABLE public.shill_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_user_id text NOT NULL,
  discord_username text NOT NULL,
  tweet_url text,
  discord_msg_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_shill_clicks_created ON public.shill_clicks(created_at DESC);

ALTER TABLE public.shill_clicks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shill_clicks_all_access" ON public.shill_clicks FOR ALL USING (true) WITH CHECK (true);
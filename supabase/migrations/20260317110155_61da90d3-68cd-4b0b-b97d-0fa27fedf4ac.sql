CREATE TABLE public.smm_artist_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_username text NOT NULL DEFAULT 'NysonBlack',
  artist_name text NOT NULL,
  artist_handle text NOT NULL,
  song_title text NOT NULL,
  media_urls text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'active',
  slot_index integer,
  days_total integer NOT NULL DEFAULT 7,
  days_completed integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  continued_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.smm_artist_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "smm_artist_campaigns_all_access" ON public.smm_artist_campaigns
  FOR ALL TO public USING (true) WITH CHECK (true);

CREATE TRIGGER set_updated_at_artist_campaigns
  BEFORE UPDATE ON public.smm_artist_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.raiders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_user_id text NOT NULL,
  discord_username text NOT NULL,
  secret_code text,
  status text NOT NULL DEFAULT 'active',
  rate_per_click numeric NOT NULL DEFAULT 0.02,
  total_clicks integer NOT NULL DEFAULT 0,
  total_earned numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (discord_user_id)
);

ALTER TABLE public.raiders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "raiders_all_access" ON public.raiders FOR ALL TO public USING (true) WITH CHECK (true);

-- Add a raid_click type column and raider_id to shill_clicks for raid tracking
ALTER TABLE public.shill_clicks ADD COLUMN IF NOT EXISTS click_type text NOT NULL DEFAULT 'shill';
ALTER TABLE public.shill_clicks ADD COLUMN IF NOT EXISTS rate numeric NOT NULL DEFAULT 0.05;
ALTER TABLE public.shill_clicks ADD COLUMN IF NOT EXISTS raider_secret_code text;

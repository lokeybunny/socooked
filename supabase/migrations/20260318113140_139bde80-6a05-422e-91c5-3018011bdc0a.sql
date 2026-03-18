ALTER TABLE public.smm_artist_campaigns
  ADD COLUMN IF NOT EXISTS schedule_pattern text NOT NULL DEFAULT 'daily',
  ADD COLUMN IF NOT EXISTS platforms text[] NOT NULL DEFAULT '{instagram}'::text[];
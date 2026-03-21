
ALTER TABLE public.shill_clicks
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'clicked',
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS receipt_tweet_url text,
  ADD COLUMN IF NOT EXISTS source_tweet_url text;

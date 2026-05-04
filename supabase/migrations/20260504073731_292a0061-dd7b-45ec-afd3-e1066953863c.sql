ALTER TABLE public.af_agents ADD COLUMN IF NOT EXISTS profile_url text;
ALTER TABLE public.af_agents ADD COLUMN IF NOT EXISTS zuid text;
CREATE INDEX IF NOT EXISTS idx_af_agents_profile_url ON public.af_agents(profile_url);
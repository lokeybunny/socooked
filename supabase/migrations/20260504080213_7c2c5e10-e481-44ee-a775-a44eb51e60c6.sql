
ALTER TABLE public.af_agents
  ADD COLUMN IF NOT EXISTS agent_zuid text,
  ADD COLUMN IF NOT EXISTS agent_profile_url text,
  ADD COLUMN IF NOT EXISTS last_profile_scraped_at timestamptz,
  ADD COLUMN IF NOT EXISTS skip_reason text,
  ADD COLUMN IF NOT EXISTS is_premier_agent boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS email text;

CREATE UNIQUE INDEX IF NOT EXISTS af_agents_agent_zuid_uniq
  ON public.af_agents (agent_zuid)
  WHERE agent_zuid IS NOT NULL;

CREATE INDEX IF NOT EXISTS af_agents_profile_pending_idx
  ON public.af_agents (last_profile_scraped_at NULLS FIRST)
  WHERE agent_profile_url IS NOT NULL AND skip_reason IS NULL;

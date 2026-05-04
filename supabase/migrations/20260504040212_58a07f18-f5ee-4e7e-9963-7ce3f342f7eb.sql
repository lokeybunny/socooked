ALTER TABLE public.leadsrain_settings
  ADD COLUMN IF NOT EXISTS default_audio_url text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS default_campaign_external_id text;
ALTER TABLE public.campaign_settings
  ADD COLUMN IF NOT EXISTS channel_mode text NOT NULL DEFAULT 'both',
  ADD COLUMN IF NOT EXISTS sms_max_retries integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS sms_min_gap_seconds integer NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS sms_max_gap_seconds integer NOT NULL DEFAULT 12;

ALTER TABLE public.campaign_settings
  DROP CONSTRAINT IF EXISTS campaign_settings_channel_mode_check;
ALTER TABLE public.campaign_settings
  ADD CONSTRAINT campaign_settings_channel_mode_check
  CHECK (channel_mode IN ('both','sms_only','email_only'));

ALTER TABLE public.campaign_contacts
  ADD COLUMN IF NOT EXISTS sms_retry_count integer NOT NULL DEFAULT 0;
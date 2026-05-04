ALTER TABLE public.leadsrain_settings
ADD COLUMN IF NOT EXISTS zapier_mode_enabled boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS zapier_webhook_url text,
ADD COLUMN IF NOT EXISTS sms_delay_minutes integer NOT NULL DEFAULT 3;
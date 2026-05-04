ALTER TABLE public.campaign_settings ALTER COLUMN sms_min_gap_seconds SET DEFAULT 10;
ALTER TABLE public.campaign_settings ALTER COLUMN sms_max_gap_seconds SET DEFAULT 30;
UPDATE public.campaign_settings SET sms_min_gap_seconds=10, sms_max_gap_seconds=30 WHERE id=1;
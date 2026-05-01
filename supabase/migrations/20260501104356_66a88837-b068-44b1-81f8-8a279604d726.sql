UPDATE public.powerdial_campaigns
SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{human_transfer_phone}', '"+17027016192"'::jsonb)
WHERE settings->>'human_transfer_phone' = '+14244651253';
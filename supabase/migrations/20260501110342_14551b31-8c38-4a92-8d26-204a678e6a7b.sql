UPDATE public.powerdial_campaigns
SET settings = COALESCE(settings, '{}'::jsonb) || jsonb_build_object('from_number', '+17028298105');
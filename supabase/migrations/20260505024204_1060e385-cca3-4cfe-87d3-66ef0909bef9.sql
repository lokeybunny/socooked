
-- Seed the business_numbers config row used by the Phone → Change Number UI
-- and read by edge functions for email signatures, Twilio forwarding, etc.
INSERT INTO public.app_settings (key, value)
VALUES (
  'business_numbers',
  jsonb_build_object(
    'cell',            '+14802200405',
    'office',          '+17027016192',
    'twilio_landline', '+17028298105',
    'updated_at',      to_jsonb(now())
  )
)
ON CONFLICT (key) DO NOTHING;

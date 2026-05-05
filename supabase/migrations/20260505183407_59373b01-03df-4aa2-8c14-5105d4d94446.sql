CREATE OR REPLACE VIEW public.state_verified_summary AS
SELECT 
  state,
  COUNT(*) FILTER (WHERE phone_line_type = 'mobile' AND phone_valid = true) AS verified_mobile,
  COUNT(*) FILTER (WHERE phone_line_type = 'landline') AS landline_count,
  COUNT(*) FILTER (WHERE phone_line_type = 'voip') AS voip_count,
  COUNT(*) FILTER (WHERE phone_valid = false) AS invalid_count,
  COUNT(*) FILTER (WHERE phone_lookup_status IS NOT NULL AND phone_lookup_status <> 'pending') AS audited_count,
  COUNT(*) AS total_count
FROM public.state_leads
WHERE state IS NOT NULL
GROUP BY state;

GRANT SELECT ON public.state_verified_summary TO anon, authenticated;
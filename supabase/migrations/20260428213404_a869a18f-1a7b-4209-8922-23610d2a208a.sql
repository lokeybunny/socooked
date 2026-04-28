CREATE UNIQUE INDEX IF NOT EXISTS idx_powerdial_one_active_call_per_phone
ON public.powerdial_call_logs (phone)
WHERE phone IS NOT NULL
  AND twilio_status IN ('initiated', 'ringing', 'answered', 'in-progress');
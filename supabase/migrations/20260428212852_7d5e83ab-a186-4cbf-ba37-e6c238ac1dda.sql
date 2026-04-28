ALTER TABLE public.powerdial_call_logs
ADD COLUMN IF NOT EXISTS voicemail_drop_claimed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS voicemail_drop_completed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS voicemail_drop_sms_sent_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS voicemail_drop_sms_status TEXT;

CREATE INDEX IF NOT EXISTS idx_powerdial_call_logs_voicemail_claim
ON public.powerdial_call_logs (id, voicemail_drop_claimed_at)
WHERE voicemail_drop_claimed_at IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_communications_vm_drop_sms_once_per_call
ON public.communications ((metadata->>'call_log_id'))
WHERE type = 'sms'
  AND direction = 'outbound'
  AND provider = 'voidfix'
  AND metadata->>'source' = 'powerdial-voicemail-drop-sms'
  AND metadata->>'call_log_id' IS NOT NULL;
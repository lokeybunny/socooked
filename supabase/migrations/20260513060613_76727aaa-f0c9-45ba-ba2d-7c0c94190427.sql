ALTER TABLE public.sms_contacts
  ADD COLUMN IF NOT EXISTS device_type text,
  ADD COLUMN IF NOT EXISTS device_audited_at timestamptz,
  ADD COLUMN IF NOT EXISTS device_audit_meta jsonb;

CREATE INDEX IF NOT EXISTS idx_sms_contacts_device_type
  ON public.sms_contacts(phone_last10) WHERE device_type IS NOT NULL;
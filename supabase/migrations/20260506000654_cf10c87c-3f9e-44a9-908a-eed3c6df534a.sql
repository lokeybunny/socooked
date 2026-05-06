ALTER TABLE public.sms_contacts
  ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pinned_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_sms_contacts_pinned ON public.sms_contacts (pinned) WHERE pinned = true;
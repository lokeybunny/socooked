
ALTER TABLE public.drop_campaigns
  ADD COLUMN IF NOT EXISTS enable_missed_call boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS vm_drop_file text,
  ADD COLUMN IF NOT EXISTS vm_drop_duration integer,
  ADD COLUMN IF NOT EXISTS raw_response jsonb;

ALTER TABLE public.drop_vm_logs
  ADD COLUMN IF NOT EXISTS vm_drop_status_url text,
  ADD COLUMN IF NOT EXISTS lead_id uuid;

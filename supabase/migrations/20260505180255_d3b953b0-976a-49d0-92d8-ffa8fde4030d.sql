
-- Cache table for Twilio Lookup results (deduped by E.164)
CREATE TABLE IF NOT EXISTS public.phone_lookups (
  phone_e164 text PRIMARY KEY,
  valid boolean NOT NULL DEFAULT false,
  line_type text,
  carrier_name text,
  carrier_type text,
  country_code text,
  raw_response jsonb,
  status text NOT NULL DEFAULT 'success',
  checked_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_phone_lookups_checked_at ON public.phone_lookups(checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_phone_lookups_line_type ON public.phone_lookups(line_type);
ALTER TABLE public.phone_lookups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read phone_lookups" ON public.phone_lookups FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert phone_lookups" ON public.phone_lookups FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update phone_lookups" ON public.phone_lookups FOR UPDATE TO authenticated USING (true);

-- Rejected leads (separate table; non-mobile / invalid / failed lookups land here)
CREATE TABLE IF NOT EXISTS public.rejected_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state text,
  phone_raw text,
  phone_normalized text,
  phone_valid boolean,
  phone_line_type text,
  phone_carrier text,
  phone_lookup_status text,
  phone_lookup_checked_at timestamptz,
  rejection_reason text NOT NULL,
  import_batch_id uuid,
  uploaded_file_name text,
  original_row jsonb,
  source text DEFAULT 'batch_upload',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rejected_leads_batch ON public.rejected_leads(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_rejected_leads_state ON public.rejected_leads(state);
CREATE INDEX IF NOT EXISTS idx_rejected_leads_reason ON public.rejected_leads(rejection_reason);
CREATE INDEX IF NOT EXISTS idx_rejected_leads_created ON public.rejected_leads(created_at DESC);
ALTER TABLE public.rejected_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read rejected_leads" ON public.rejected_leads FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert rejected_leads" ON public.rejected_leads FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated delete rejected_leads" ON public.rejected_leads FOR DELETE TO authenticated USING (true);

-- Tracking job for existing-DB audit (start/pause/resume)
CREATE TABLE IF NOT EXISTS public.phone_audit_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'queued',
  total integer NOT NULL DEFAULT 0,
  processed integer NOT NULL DEFAULT 0,
  mobile integer NOT NULL DEFAULT 0,
  landline integer NOT NULL DEFAULT 0,
  voip integer NOT NULL DEFAULT 0,
  invalid integer NOT NULL DEFAULT 0,
  unknown integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  cache_hits integer NOT NULL DEFAULT 0,
  new_lookups integer NOT NULL DEFAULT 0,
  current_phone text,
  error_message text,
  started_at timestamptz,
  paused_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_phone_audit_jobs_status ON public.phone_audit_jobs(status);
CREATE INDEX IF NOT EXISTS idx_phone_audit_jobs_created ON public.phone_audit_jobs(created_at DESC);
ALTER TABLE public.phone_audit_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read phone_audit_jobs" ON public.phone_audit_jobs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert phone_audit_jobs" ON public.phone_audit_jobs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update phone_audit_jobs" ON public.phone_audit_jobs FOR UPDATE TO authenticated USING (true);

CREATE TRIGGER set_phone_audit_jobs_updated_at
  BEFORE UPDATE ON public.phone_audit_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Audit columns on state_leads (phone_e164 already UNIQUE — that's our enforcement)
ALTER TABLE public.state_leads
  ADD COLUMN IF NOT EXISTS phone_valid boolean,
  ADD COLUMN IF NOT EXISTS phone_line_type text,
  ADD COLUMN IF NOT EXISTS phone_carrier text,
  ADD COLUMN IF NOT EXISTS phone_lookup_status text,
  ADD COLUMN IF NOT EXISTS phone_lookup_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS import_batch_id uuid,
  ADD COLUMN IF NOT EXISTS duplicate_of_lead_id uuid;

CREATE INDEX IF NOT EXISTS idx_state_leads_line_type ON public.state_leads(phone_line_type);
CREATE INDEX IF NOT EXISTS idx_state_leads_lookup_checked ON public.state_leads(phone_lookup_checked_at);
CREATE INDEX IF NOT EXISTS idx_state_leads_batch ON public.state_leads(import_batch_id);

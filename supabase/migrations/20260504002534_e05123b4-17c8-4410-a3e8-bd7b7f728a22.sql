CREATE TABLE IF NOT EXISTS public.leadsrain_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid,
  contact_id uuid,
  customer_id uuid,
  phone_number text NOT NULL,
  caller_id text,
  campaign_name text,
  audio_url text,
  status text NOT NULL DEFAULT 'draft',
  leadsrain_lead_id text,
  leadsrain_message text,
  raw_request jsonb,
  raw_response jsonb,
  error_message text,
  voidfix_sms_sent boolean NOT NULL DEFAULT false,
  voidfix_sms_at timestamptz,
  submitted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leadsrain_submissions_status ON public.leadsrain_submissions(status);
CREATE INDEX IF NOT EXISTS idx_leadsrain_submissions_created ON public.leadsrain_submissions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leadsrain_submissions_phone ON public.leadsrain_submissions(phone_number);

ALTER TABLE public.leadsrain_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view submissions"
  ON public.leadsrain_submissions FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated can insert submissions"
  ON public.leadsrain_submissions FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can update submissions"
  ON public.leadsrain_submissions FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER trg_leadsrain_submissions_updated
  BEFORE UPDATE ON public.leadsrain_submissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Cleanup: drop old BatchLeads table
DROP TABLE IF EXISTS public.batchleads_phone_pulls CASCADE;

-- state_leads
CREATE TABLE public.state_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number text NOT NULL,
  phone_e164 text NOT NULL UNIQUE,
  state text NOT NULL,
  name text,
  address text,
  city text,
  zip text,
  source text NOT NULL DEFAULT 'batch_upload',
  uploaded_file_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_state_leads_state ON public.state_leads(state);
CREATE INDEX idx_state_leads_created_at ON public.state_leads(created_at DESC);

ALTER TABLE public.state_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view state_leads" ON public.state_leads
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert state_leads" ON public.state_leads
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update state_leads" ON public.state_leads
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete state_leads" ON public.state_leads
  FOR DELETE TO authenticated USING (true);

-- state_summary
CREATE TABLE public.state_summary (
  state text PRIMARY KEY,
  total_leads integer NOT NULL DEFAULT 0,
  total_unique_numbers integer NOT NULL DEFAULT 0,
  last_upload_at timestamptz
);

ALTER TABLE public.state_summary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view state_summary" ON public.state_summary
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can manage state_summary" ON public.state_summary
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- upload_logs
CREATE TABLE public.upload_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state text NOT NULL,
  file_name text,
  total_rows integer NOT NULL DEFAULT 0,
  inserted_count integer NOT NULL DEFAULT 0,
  duplicate_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_upload_logs_created_at ON public.upload_logs(created_at DESC);
CREATE INDEX idx_upload_logs_state ON public.upload_logs(state);

ALTER TABLE public.upload_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view upload_logs" ON public.upload_logs
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert upload_logs" ON public.upload_logs
  FOR INSERT TO authenticated WITH CHECK (true);

-- Trigger: maintain state_summary on state_leads insert
CREATE OR REPLACE FUNCTION public.bump_state_summary()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.state_summary (state, total_leads, total_unique_numbers, last_upload_at)
  VALUES (NEW.state, 1, 1, now())
  ON CONFLICT (state) DO UPDATE
    SET total_leads = public.state_summary.total_leads + 1,
        total_unique_numbers = public.state_summary.total_unique_numbers + 1,
        last_upload_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_bump_state_summary
AFTER INSERT ON public.state_leads
FOR EACH ROW EXECUTE FUNCTION public.bump_state_summary();

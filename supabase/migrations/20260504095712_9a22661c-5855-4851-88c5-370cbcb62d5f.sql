
CREATE TABLE IF NOT EXISTS public.batchleads_phone_pulls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number text,
  phone_e164 text UNIQUE,
  phone_type text,
  location text,
  radius_miles integer,
  source text DEFAULT 'batchleads',
  status text DEFAULT 'new',
  pulled_at timestamptz DEFAULT now(),
  raw_response jsonb
);

CREATE TABLE IF NOT EXISTS public.outbound_call_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_e164 text UNIQUE,
  source text DEFAULT 'batchleads',
  campaign_status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  last_attempt_at timestamptz,
  notes text
);

ALTER TABLE public.batchleads_phone_pulls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbound_call_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view phone pulls"
  ON public.batchleads_phone_pulls FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert phone pulls"
  ON public.batchleads_phone_pulls FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update phone pulls"
  ON public.batchleads_phone_pulls FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete phone pulls"
  ON public.batchleads_phone_pulls FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated can view call queue"
  ON public.outbound_call_queue FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert call queue"
  ON public.outbound_call_queue FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update call queue"
  ON public.outbound_call_queue FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete call queue"
  ON public.outbound_call_queue FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_batchleads_pulls_pulled_at ON public.batchleads_phone_pulls(pulled_at DESC);
CREATE INDEX IF NOT EXISTS idx_outbound_call_queue_status ON public.outbound_call_queue(campaign_status);

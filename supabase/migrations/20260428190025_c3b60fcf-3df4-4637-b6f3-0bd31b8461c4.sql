
-- SMS auto-responder sequences
CREATE TABLE public.sms_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL DEFAULT 'reply', -- 'reply' (recipient must reply to advance)
  ai_fallback_enabled BOOLEAN NOT NULL DEFAULT true,
  ai_system_prompt TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Steps in a sequence: ordered messages
CREATE TABLE public.sms_sequence_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID NOT NULL REFERENCES public.sms_sequences(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  body TEXT NOT NULL,
  -- Optional: only fire if recipient reply matches this regex/keyword (lowercased contains). null = any reply.
  reply_match TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (sequence_id, step_order)
);

-- A recipient enrolled in a sequence (one row per phone per sequence enrollment)
CREATE TABLE public.sms_sequence_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID NOT NULL REFERENCES public.sms_sequences(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  contact_name TEXT,
  customer_id UUID,
  current_step INTEGER NOT NULL DEFAULT 0, -- 0 = greet sent, awaiting reply for step 1
  status TEXT NOT NULL DEFAULT 'active', -- active | completed | stopped | opted_out
  source TEXT, -- e.g. 'sms_blast', 'powerdial_campaign'
  source_id UUID,
  last_inbound_at TIMESTAMPTZ,
  last_outbound_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (sequence_id, phone)
);

CREATE INDEX idx_sse_phone ON public.sms_sequence_enrollments(phone);
CREATE INDEX idx_sse_status ON public.sms_sequence_enrollments(status);
CREATE INDEX idx_sss_seq_order ON public.sms_sequence_steps(sequence_id, step_order);

-- RLS
ALTER TABLE public.sms_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_sequence_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_sequence_enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access sequences" ON public.sms_sequences
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access sequence steps" ON public.sms_sequence_steps
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access sequence enrollments" ON public.sms_sequence_enrollments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Service role policies (for edge functions)
CREATE POLICY "Service role sequences" ON public.sms_sequences
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role sequence steps" ON public.sms_sequence_steps
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role sequence enrollments" ON public.sms_sequence_enrollments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- updated_at triggers
CREATE TRIGGER tg_sms_sequences_updated BEFORE UPDATE ON public.sms_sequences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER tg_sms_sequence_enrollments_updated BEFORE UPDATE ON public.sms_sequence_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.contact_transcripts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone_last10 TEXT NOT NULL,
  title TEXT,
  filename TEXT,
  duration_seconds INTEGER,
  voice_count INTEGER,
  summary TEXT,
  conversation_type TEXT,
  sentiment TEXT,
  client_wants TEXT[],
  chatgpt_prompt TEXT,
  transcript TEXT,
  analysis JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_contact_transcripts_phone ON public.contact_transcripts(phone_last10, created_at DESC);

ALTER TABLE public.contact_transcripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read contact_transcripts" ON public.contact_transcripts
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert contact_transcripts" ON public.contact_transcripts
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update contact_transcripts" ON public.contact_transcripts
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete contact_transcripts" ON public.contact_transcripts
  FOR DELETE TO authenticated USING (true);

CREATE TRIGGER trg_contact_transcripts_updated
  BEFORE UPDATE ON public.contact_transcripts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
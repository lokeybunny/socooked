
-- Table to store transcriptions of call recordings and voicemails
CREATE TABLE public.transcriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_type TEXT NOT NULL CHECK (source_type IN ('recording', 'voicemail')),
  source_id TEXT NOT NULL,
  phone_from TEXT,
  phone_to TEXT,
  direction TEXT,
  duration_seconds INTEGER,
  transcript TEXT NOT NULL,
  summary TEXT,
  occurred_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  customer_id UUID REFERENCES public.customers(id),
  UNIQUE(source_type, source_id)
);

-- Enable RLS
ALTER TABLE public.transcriptions ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users full access
CREATE POLICY "Authenticated users can view transcriptions"
  ON public.transcriptions FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert transcriptions"
  ON public.transcriptions FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update transcriptions"
  ON public.transcriptions FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete transcriptions"
  ON public.transcriptions FOR DELETE
  USING (auth.uid() IS NOT NULL);

-- Also allow service role (edge functions) to insert via anon key with no auth
CREATE POLICY "Service can manage transcriptions"
  ON public.transcriptions FOR ALL
  USING (true)
  WITH CHECK (true);

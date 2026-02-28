
CREATE TABLE public.research_findings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  source_url TEXT,
  category TEXT DEFAULT 'lead',
  finding_type TEXT NOT NULL DEFAULT 'lead',
  summary TEXT,
  raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'new',
  customer_id UUID REFERENCES public.customers(id),
  created_by TEXT DEFAULT 'spacebot',
  tags TEXT[] NOT NULL DEFAULT '{}'::text[],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.research_findings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "research_findings_all_access" ON public.research_findings
  FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER set_research_findings_updated_at
  BEFORE UPDATE ON public.research_findings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

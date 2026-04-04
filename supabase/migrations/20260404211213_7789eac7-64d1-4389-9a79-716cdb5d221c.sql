
CREATE TABLE public.videography_prospects (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_name text NOT NULL,
  phone text,
  address text,
  website text,
  contact_name text,
  contact_role text,
  contact_email text,
  contact_phone text,
  pipeline_stage text NOT NULL DEFAULT 'new',
  agreement_doc_id uuid,
  notes text,
  next_followup_at timestamp with time zone,
  last_contacted_at timestamp with time zone,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.videography_prospects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "videography_prospects_auth_access"
  ON public.videography_prospects
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER set_videography_prospects_updated_at
  BEFORE UPDATE ON public.videography_prospects
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- 1. Allow 'proposal' as a documents.type
ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_type_check;
ALTER TABLE public.documents
  ADD CONSTRAINT documents_type_check
  CHECK (type = ANY (ARRAY['resume'::text, 'contract'::text, 'proposal'::text]));

-- 2. Create proposals table
CREATE TABLE IF NOT EXISTS public.proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  client_name text NOT NULL,
  client_email text,
  client_phone text,
  company_name text,
  amount numeric(12,2) DEFAULT 0,
  currency text DEFAULT 'USD',
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  terms text,
  proposal_body text,
  expiration_date date,
  signature_required boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','sent','viewed','signed','expired','cancelled')),
  document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  deal_id uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  lead_id uuid,
  project_id uuid,
  invoice_id uuid,
  sent_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  sent_at timestamptz,
  viewed_at timestamptz,
  signed_at timestamptz,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proposals_customer ON public.proposals(customer_id);
CREATE INDEX IF NOT EXISTS idx_proposals_document ON public.proposals(document_id);
CREATE INDEX IF NOT EXISTS idx_proposals_status   ON public.proposals(status);
CREATE INDEX IF NOT EXISTS idx_proposals_created  ON public.proposals(created_at DESC);

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_proposals_updated_at ON public.proposals;
CREATE TRIGGER trg_proposals_updated_at
BEFORE UPDATE ON public.proposals
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- activity log trigger
DROP TRIGGER IF EXISTS trg_activity_proposals ON public.proposals;
CREATE TRIGGER trg_activity_proposals
AFTER INSERT OR UPDATE OR DELETE ON public.proposals
FOR EACH ROW EXECUTE FUNCTION public.log_activity('proposal');

-- RLS
ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "proposals_auth_all" ON public.proposals;
CREATE POLICY "proposals_auth_all" ON public.proposals
  AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- public read for the signing page (only when linked to a doc that is pending or signed)
DROP POLICY IF EXISTS "proposals_public_read_via_doc" ON public.proposals;
CREATE POLICY "proposals_public_read_via_doc" ON public.proposals
  FOR SELECT
  USING (
    document_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.id = proposals.document_id
        AND d.status IN ('pending_signature','signed')
    )
  );

-- 3. Auto-flip proposal -> signed when its document gets signed
CREATE OR REPLACE FUNCTION public.auto_mark_proposal_signed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'signed' AND (OLD.status IS DISTINCT FROM 'signed') THEN
    UPDATE public.proposals
       SET status = 'signed',
           signed_at = now(),
           updated_at = now()
     WHERE document_id = NEW.id
       AND status <> 'signed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_mark_proposal_signed ON public.documents;
CREATE TRIGGER trg_auto_mark_proposal_signed
AFTER UPDATE ON public.documents
FOR EACH ROW EXECUTE FUNCTION public.auto_mark_proposal_signed();

-- =============================
-- CONVERSATION THREADS
-- =============================
CREATE TABLE public.conversation_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'chat' CHECK (channel IN ('chat','email','sms','call','dm')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','collecting_info','ready_for_docs','docs_generated','sent_for_signature','signed','invoiced')),
  summary text,
  raw_transcript text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_threads_customer ON public.conversation_threads(customer_id);
CREATE INDEX idx_threads_status ON public.conversation_threads(status);

CREATE TRIGGER threads_set_updated_at BEFORE UPDATE ON public.conversation_threads
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.conversation_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "threads_rw" ON public.conversation_threads
FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Customer portal: customers can view their own threads
CREATE POLICY "threads_customer_read" ON public.conversation_threads
FOR SELECT TO authenticated
USING (customer_id IN (SELECT c.id FROM public.customers c WHERE c.email = (SELECT auth.jwt()->>'email')));

-- =============================
-- DOCUMENTS
-- =============================
CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  thread_id uuid REFERENCES public.conversation_threads(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('resume','contract')),
  title text NOT NULL,
  storage_path text,
  file_url text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','final')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_documents_customer ON public.documents(customer_id);
CREATE INDEX idx_documents_thread ON public.documents(thread_id);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "documents_rw" ON public.documents
FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =============================
-- SIGNATURES
-- =============================
CREATE TABLE public.signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  signer_name text NOT NULL,
  signer_email text NOT NULL,
  signature_type text NOT NULL CHECK (signature_type IN ('typed','drawn')),
  signature_data text NOT NULL,
  signed_at timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  user_agent text
);

CREATE INDEX idx_signatures_document ON public.signatures(document_id);
CREATE INDEX idx_signatures_customer ON public.signatures(customer_id);

ALTER TABLE public.signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "signatures_rw" ON public.signatures
FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =============================
-- INVOICES
-- =============================
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  deal_id uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','paid','void')),
  provider text NOT NULL DEFAULT 'manual' CHECK (provider IN ('stripe','manual')),
  invoice_url text,
  payment_url text,
  sent_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_invoices_customer ON public.invoices(customer_id);
CREATE INDEX idx_invoices_status ON public.invoices(status);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoices_rw" ON public.invoices
FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =============================
-- WEBHOOK EVENTS
-- =============================
CREATE TABLE public.webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN ('clawdbot','email_provider','stripe')),
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_webhook_events_source ON public.webhook_events(source);
CREATE INDEX idx_webhook_events_processed ON public.webhook_events(processed);

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "webhook_events_rw" ON public.webhook_events
FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =============================
-- STORAGE BUCKET FOR DOCUMENTS
-- =============================
INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', false);

-- Staff can do anything with documents
CREATE POLICY "staff_documents_all" ON storage.objects
FOR ALL TO authenticated
USING (bucket_id = 'documents')
WITH CHECK (bucket_id = 'documents');

-- =============================
-- ENABLE REALTIME FOR THREADS
-- =============================
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_threads;

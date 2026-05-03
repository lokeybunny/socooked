-- Production queue table
CREATE TABLE IF NOT EXISTS public.production_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  proposal_id uuid REFERENCES public.proposals(id) ON DELETE SET NULL,
  agreement_document_id uuid,
  invoice_id uuid,

  first_name text,
  last_name text,
  email text,
  phone text,
  listing_address text,

  status text NOT NULL DEFAULT 'signed',
  -- new_lead, proposal_sent, proposal_viewed, signed, payment_pending,
  -- payment_approved, in_production, awaiting_assets, editing,
  -- delivered, completed, overdue

  production_started_at timestamptz,
  deadline_at timestamptz,
  paused_at timestamptz,
  total_paused_seconds integer NOT NULL DEFAULT 0,
  completed_at timestamptz,
  assigned_to uuid,

  assets_uploaded boolean NOT NULL DEFAULT false,
  listing_photos_status text,

  signed_at timestamptz,
  signed_ip text,
  proposal_viewed_at timestamptz,
  payment_approved_at timestamptz,

  notes text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (proposal_id)
);

CREATE INDEX IF NOT EXISTS idx_production_queue_status ON public.production_queue(status);
CREATE INDEX IF NOT EXISTS idx_production_queue_deadline ON public.production_queue(deadline_at);
CREATE INDEX IF NOT EXISTS idx_production_queue_assigned ON public.production_queue(assigned_to);

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_production_queue_updated_at ON public.production_queue;
CREATE TRIGGER trg_production_queue_updated_at
BEFORE UPDATE ON public.production_queue
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.production_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read" ON public.production_queue;
CREATE POLICY "Authenticated read" ON public.production_queue
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated write" ON public.production_queue;
CREATE POLICY "Authenticated write" ON public.production_queue
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Realtime
ALTER TABLE public.production_queue REPLICA IDENTITY FULL;
DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='production_queue';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.production_queue';
  END IF;
END $$;

-- Auto-enqueue on proposal signed
CREATE OR REPLACE FUNCTION public.auto_enqueue_production_on_signed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _customer record;
  _name_parts text[];
  _first text;
  _last text;
BEGIN
  IF NEW.status = 'signed' AND (OLD.status IS DISTINCT FROM 'signed') THEN
    -- skip if already exists
    IF EXISTS (SELECT 1 FROM public.production_queue WHERE proposal_id = NEW.id) THEN
      RETURN NEW;
    END IF;

    SELECT * INTO _customer FROM public.customers WHERE id = NEW.customer_id;

    _name_parts := regexp_split_to_array(COALESCE(NEW.client_name, _customer.full_name, ''), '\s+');
    _first := COALESCE(_name_parts[1], '');
    _last := COALESCE(array_to_string(_name_parts[2:array_length(_name_parts,1)], ' '), '');

    INSERT INTO public.production_queue (
      customer_id, proposal_id, first_name, last_name, email, phone,
      listing_address, status, signed_at, payment_approved_at, meta
    ) VALUES (
      NEW.customer_id,
      NEW.id,
      _first,
      _last,
      COALESCE(NEW.client_email, _customer.email),
      COALESCE(NEW.client_phone, _customer.phone),
      COALESCE(NEW.meta->>'listing_address', NEW.meta->>'property_address', _customer.address),
      'signed',
      COALESCE(NEW.signed_at, now()),
      CASE WHEN (NEW.meta ->> 'deposit_paid_at') IS NOT NULL THEN now() ELSE NULL END,
      jsonb_build_object('proposal_title', NEW.title, 'amount', NEW.amount)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_enqueue_production_on_signed ON public.proposals;
CREATE TRIGGER trg_auto_enqueue_production_on_signed
AFTER UPDATE ON public.proposals
FOR EACH ROW EXECUTE FUNCTION public.auto_enqueue_production_on_signed();

-- Mark overdue helper
CREATE OR REPLACE FUNCTION public.production_queue_mark_overdue()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.production_queue
  SET status = 'overdue'
  WHERE deadline_at IS NOT NULL
    AND deadline_at < now()
    AND status NOT IN ('completed', 'delivered', 'overdue');
$$;
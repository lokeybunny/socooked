UPDATE public.production_queue pq
SET listing_address = COALESCE(
  NULLIF(p.meta->>'listing_address',''),
  NULLIF(p.meta->>'property_address',''),
  NULLIF(substring(p.title from '\(([^()]+)\)\s*$'),''),
  NULLIF(substring(p.proposal_body from 'Property:\s*([^\n\r]+)'),''),
  c.address
)
FROM public.proposals p
LEFT JOIN public.customers c ON c.id = p.customer_id
WHERE pq.proposal_id = p.id
  AND (pq.listing_address IS NULL OR pq.listing_address = '');

UPDATE public.production_queue
SET listing_address = NULL
WHERE listing_address IS NOT NULL
  AND (trim(listing_address) = '' OR upper(trim(listing_address)) IN ('N/A','NA','NONE'));

UPDATE public.production_queue
SET listing_address = trim(listing_address)
WHERE listing_address IS NOT NULL AND listing_address <> trim(listing_address);

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
  _addr text;
BEGIN
  IF NEW.status = 'signed' AND (OLD.status IS DISTINCT FROM 'signed') THEN
    _addr := COALESCE(
      NULLIF(NEW.meta->>'listing_address',''),
      NULLIF(NEW.meta->>'property_address',''),
      NULLIF(substring(NEW.title from '\(([^()]+)\)\s*$'),''),
      NULLIF(substring(NEW.proposal_body from 'Property:\s*([^\n\r]+)'),'')
    );

    IF EXISTS (SELECT 1 FROM public.production_queue WHERE proposal_id = NEW.id) THEN
      IF _addr IS NOT NULL THEN
        UPDATE public.production_queue
          SET listing_address = COALESCE(NULLIF(listing_address,''), trim(_addr))
          WHERE proposal_id = NEW.id;
      END IF;
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
      NULLIF(trim(COALESCE(_addr, _customer.address, '')),''),
      'signed',
      COALESCE(NEW.signed_at, now()),
      CASE WHEN (NEW.meta ->> 'deposit_paid_at') IS NOT NULL THEN now() ELSE NULL END,
      jsonb_build_object('proposal_title', NEW.title, 'amount', NEW.amount)
    );
  END IF;
  RETURN NEW;
END;
$$;
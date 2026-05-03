CREATE OR REPLACE FUNCTION public.auto_enqueue_production_on_authnet_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _customer record;
  _proposal record;
  _existing_id uuid;
  _email text;
  _name_parts text[];
  _first text;
  _last text;
  _now timestamptz := COALESCE(NEW.created_at, now());
  _deadline timestamptz := _now + interval '72 hours';
BEGIN
  _email := lower(trim(COALESCE(NEW.payer_email, '')));

  IF _email <> '' THEN
    SELECT * INTO _customer FROM public.customers
    WHERE lower(email) = _email
    ORDER BY created_at DESC LIMIT 1;
  END IF;

  IF _customer.id IS NOT NULL THEN
    SELECT * INTO _proposal FROM public.proposals
    WHERE customer_id = _customer.id
    ORDER BY (status = 'signed') DESC, signed_at DESC NULLS LAST, created_at DESC
    LIMIT 1;
  END IF;
  IF _proposal.id IS NULL AND _email <> '' THEN
    SELECT * INTO _proposal FROM public.proposals
    WHERE lower(client_email) = _email
    ORDER BY (status = 'signed') DESC, signed_at DESC NULLS LAST, created_at DESC
    LIMIT 1;
  END IF;

  IF _proposal.id IS NOT NULL THEN
    SELECT id INTO _existing_id FROM public.production_queue
    WHERE proposal_id = _proposal.id LIMIT 1;
  END IF;
  IF _existing_id IS NULL AND _customer.id IS NOT NULL THEN
    SELECT id INTO _existing_id FROM public.production_queue
    WHERE customer_id = _customer.id
      AND status NOT IN ('completed','delivered')
    ORDER BY created_at DESC LIMIT 1;
  END IF;

  IF _existing_id IS NOT NULL THEN
    UPDATE public.production_queue
    SET payment_approved_at = COALESCE(payment_approved_at, _now),
        production_started_at = COALESCE(production_started_at, _now),
        deadline_at = COALESCE(deadline_at, _deadline),
        status = CASE WHEN status IN ('completed','delivered') THEN status ELSE 'in_production' END,
        meta = COALESCE(meta,'{}'::jsonb) || jsonb_build_object(
          'authnet_transaction_id', NEW.transaction_id,
          'authnet_amount', NEW.amount,
          'authnet_paid_at', _now
        ),
        updated_at = now()
    WHERE id = _existing_id;
  ELSE
    _name_parts := regexp_split_to_array(COALESCE(NEW.payer_name, _customer.full_name, ''), '\s+');
    _first := COALESCE(_name_parts[1], '');
    _last  := COALESCE(array_to_string(_name_parts[2:array_length(_name_parts,1)], ' '), '');

    INSERT INTO public.production_queue (
      customer_id, proposal_id,
      first_name, last_name, email, phone, listing_address,
      status, production_started_at, deadline_at,
      signed_at, payment_approved_at, meta
    ) VALUES (
      _customer.id, _proposal.id,
      _first, _last,
      COALESCE(_proposal.client_email, _customer.email, NEW.payer_email),
      COALESCE(_proposal.client_phone, _customer.phone),
      COALESCE(_proposal.meta->>'listing_address', _proposal.meta->>'property_address', _customer.address),
      'in_production', _now, _deadline,
      _proposal.signed_at, _now,
      jsonb_build_object(
        'authnet_transaction_id', NEW.transaction_id,
        'authnet_amount', NEW.amount,
        'authnet_paid_at', _now,
        'auto_started_from_payment', true
      )
    );
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'auto_enqueue_production_on_authnet_payment error: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_enqueue_production_on_authnet ON public.payme_charges;
CREATE TRIGGER trg_auto_enqueue_production_on_authnet
AFTER INSERT ON public.payme_charges
FOR EACH ROW EXECUTE FUNCTION public.auto_enqueue_production_on_authnet_payment();

-- Backfill: re-insert into production_queue logic for existing payments by re-firing trigger function
DO $$
DECLARE r public.payme_charges%ROWTYPE;
BEGIN
  FOR r IN SELECT * FROM public.payme_charges ORDER BY created_at ASC LOOP
    -- Simulate NEW context by calling logic via a temp trigger-equivalent manual block
    DECLARE
      _customer record; _proposal record; _existing_id uuid; _email text;
      _name_parts text[]; _first text; _last text;
      _now timestamptz := COALESCE(r.created_at, now());
      _deadline timestamptz := _now + interval '72 hours';
    BEGIN
      _email := lower(trim(COALESCE(r.payer_email, '')));
      IF _email <> '' THEN
        SELECT * INTO _customer FROM public.customers WHERE lower(email) = _email ORDER BY created_at DESC LIMIT 1;
      END IF;
      IF _customer.id IS NOT NULL THEN
        SELECT * INTO _proposal FROM public.proposals WHERE customer_id = _customer.id
          ORDER BY (status='signed') DESC, signed_at DESC NULLS LAST, created_at DESC LIMIT 1;
      END IF;
      IF _proposal.id IS NULL AND _email <> '' THEN
        SELECT * INTO _proposal FROM public.proposals WHERE lower(client_email) = _email
          ORDER BY (status='signed') DESC, signed_at DESC NULLS LAST, created_at DESC LIMIT 1;
      END IF;
      IF _proposal.id IS NOT NULL THEN
        SELECT id INTO _existing_id FROM public.production_queue WHERE proposal_id = _proposal.id LIMIT 1;
      END IF;
      IF _existing_id IS NULL AND _customer.id IS NOT NULL THEN
        SELECT id INTO _existing_id FROM public.production_queue
        WHERE customer_id = _customer.id AND status NOT IN ('completed','delivered')
        ORDER BY created_at DESC LIMIT 1;
      END IF;
      IF _existing_id IS NOT NULL THEN
        UPDATE public.production_queue
        SET payment_approved_at = COALESCE(payment_approved_at, _now),
            production_started_at = COALESCE(production_started_at, _now),
            deadline_at = COALESCE(deadline_at, _deadline),
            status = CASE WHEN status IN ('completed','delivered') THEN status ELSE 'in_production' END,
            meta = COALESCE(meta,'{}'::jsonb) || jsonb_build_object(
              'authnet_transaction_id', r.transaction_id,
              'authnet_amount', r.amount,
              'authnet_paid_at', _now)
        WHERE id = _existing_id;
      ELSE
        _name_parts := regexp_split_to_array(COALESCE(r.payer_name, _customer.full_name, ''), '\s+');
        _first := COALESCE(_name_parts[1],''); _last := COALESCE(array_to_string(_name_parts[2:array_length(_name_parts,1)],' '),'');
        INSERT INTO public.production_queue (
          customer_id, proposal_id, first_name, last_name, email, phone, listing_address,
          status, production_started_at, deadline_at, signed_at, payment_approved_at, meta
        ) VALUES (
          _customer.id, _proposal.id, _first, _last,
          COALESCE(_proposal.client_email, _customer.email, r.payer_email),
          COALESCE(_proposal.client_phone, _customer.phone),
          COALESCE(_proposal.meta->>'listing_address', _proposal.meta->>'property_address', _customer.address),
          'in_production', _now, _deadline, _proposal.signed_at, _now,
          jsonb_build_object('authnet_transaction_id', r.transaction_id, 'authnet_amount', r.amount,
                             'authnet_paid_at', _now, 'auto_started_from_payment', true, 'backfilled', true)
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'backfill error for charge %: %', r.transaction_id, SQLERRM;
    END;
  END LOOP;
END $$;

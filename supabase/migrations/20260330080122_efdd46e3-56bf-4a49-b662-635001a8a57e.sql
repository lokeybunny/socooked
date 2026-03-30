
CREATE OR REPLACE FUNCTION public.auto_move_seller_under_contract()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _seller_id uuid;
BEGIN
  -- Only fire when document status changes to 'signed' and it's a contract
  IF NEW.status = 'signed' AND OLD.status IS DISTINCT FROM 'signed' AND NEW.type = 'contract' THEN
    -- Look up seller_id from the linked customer's meta
    SELECT (meta->>'seller_id')::uuid INTO _seller_id
    FROM public.customers
    WHERE id = NEW.customer_id
      AND meta->>'seller_id' IS NOT NULL;

    -- Also check communications for seller_id linkage (agreement drafts store it there)
    IF _seller_id IS NULL THEN
      SELECT (metadata->>'seller_id')::uuid INTO _seller_id
      FROM public.communications
      WHERE provider = 'wholesale-agreement'
        AND metadata->>'seller_id' IS NOT NULL
        AND (
          (customer_id = NEW.customer_id) OR
          (subject ILIKE '%' || COALESCE((SELECT full_name FROM customers WHERE id = NEW.customer_id), '') || '%')
        )
      ORDER BY created_at DESC
      LIMIT 1;
    END IF;

    -- Update the seller status to under_contract
    IF _seller_id IS NOT NULL THEN
      UPDATE public.lw_sellers
      SET status = 'under_contract', updated_at = now()
      WHERE id = _seller_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_seller_under_contract
  AFTER UPDATE ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_move_seller_under_contract();

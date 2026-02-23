
-- Trigger function: auto-create a project when an invoice is marked as paid
CREATE OR REPLACE FUNCTION public.create_project_on_invoice_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _customer record;
  _project_title text;
  _existing_project_id uuid;
BEGIN
  -- Only fire when status changes to 'paid'
  IF NEW.status = 'paid' AND (OLD.status IS DISTINCT FROM 'paid') THEN
    -- Get customer info
    SELECT id, full_name, category INTO _customer
    FROM public.customers
    WHERE id = NEW.customer_id;

    IF _customer.id IS NULL THEN
      RETURN NEW;
    END IF;

    -- Build title: "Customer Name — Category Label"
    _project_title := _customer.full_name || ' — ' || COALESCE(
      CASE _customer.category
        WHEN 'digital-services' THEN 'Digital Services'
        WHEN 'brick-and-mortar' THEN 'Brick & Mortar'
        WHEN 'digital-ecommerce' THEN 'Digital E-Commerce'
        WHEN 'food-and-beverage' THEN 'Food & Beverage'
        WHEN 'mobile-services' THEN 'Mobile Services'
        ELSE 'Other'
      END, 'Other');

    -- Check if an active project already exists for this customer + category
    SELECT id INTO _existing_project_id
    FROM public.projects
    WHERE customer_id = NEW.customer_id
      AND category = COALESCE(_customer.category, 'other')
      AND status NOT IN ('completed', 'archived')
    LIMIT 1;

    -- Only create if no active project exists
    IF _existing_project_id IS NULL THEN
      INSERT INTO public.projects (title, customer_id, category, status, priority, description)
      VALUES (
        _project_title,
        NEW.customer_id,
        COALESCE(_customer.category, 'other'),
        'active',
        'medium',
        'Auto-created when invoice ' || COALESCE(NEW.invoice_number, NEW.id::text) || ' was paid.'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Attach the trigger to the invoices table
DROP TRIGGER IF EXISTS trg_create_project_on_invoice_paid ON public.invoices;
CREATE TRIGGER trg_create_project_on_invoice_paid
  AFTER UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.create_project_on_invoice_paid();

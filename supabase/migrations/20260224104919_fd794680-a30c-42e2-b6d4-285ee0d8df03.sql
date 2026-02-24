
CREATE OR REPLACE FUNCTION public.create_project_on_deal_won()
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
  -- Only fire when stage changes to 'won'
  IF NEW.stage = 'won' AND (OLD.stage IS DISTINCT FROM 'won') THEN
    SELECT id, full_name, category INTO _customer
    FROM public.customers
    WHERE id = NEW.customer_id;

    IF _customer.id IS NULL THEN
      RETURN NEW;
    END IF;

    _project_title := _customer.full_name || ' — ' || COALESCE(
      CASE COALESCE(NEW.category, _customer.category)
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
      AND category = COALESCE(NEW.category, _customer.category, 'other')
      AND status NOT IN ('completed', 'archived')
    LIMIT 1;

    IF _existing_project_id IS NULL THEN
      INSERT INTO public.projects (title, customer_id, category, status, priority, description)
      VALUES (
        _project_title,
        NEW.customer_id,
        COALESCE(NEW.category, _customer.category, 'other'),
        'active',
        'medium',
        'Auto-created when deal "' || NEW.title || '" was won.'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_create_project_on_deal_won
  AFTER UPDATE ON public.deals
  FOR EACH ROW
  EXECUTE FUNCTION public.create_project_on_deal_won();


CREATE OR REPLACE FUNCTION public.auto_create_project_for_customer()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _project_title text;
  _category_label text;
BEGIN
  _category_label := COALESCE(
    CASE NEW.category
      WHEN 'digital-services' THEN 'Digital Services'
      WHEN 'brick-and-mortar' THEN 'Brick & Mortar'
      WHEN 'digital-ecommerce' THEN 'Digital E-Commerce'
      WHEN 'food-and-beverage' THEN 'Food & Beverage'
      WHEN 'mobile-services' THEN 'Mobile Services'
      ELSE 'Other'
    END, 'Other');

  _project_title := NEW.full_name || ' — ' || _category_label;

  INSERT INTO public.projects (title, customer_id, category, status, priority, description)
  VALUES (
    _project_title,
    NEW.id,
    COALESCE(NEW.category, 'other'),
    'active',
    'medium',
    'Auto-created when customer was added.'
  );

  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_auto_create_project_for_customer
  AFTER INSERT ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_project_for_customer();


-- Auto-create a deal in 'new' stage when a customer is inserted
CREATE OR REPLACE FUNCTION public.auto_create_deal_for_customer()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.deals (title, customer_id, category, stage, status, pipeline, deal_value, probability)
  VALUES (
    NEW.full_name || ' — ' || COALESCE(
      CASE NEW.category
        WHEN 'digital-services' THEN 'Digital Services'
        WHEN 'brick-and-mortar' THEN 'Brick & Mortar'
        WHEN 'digital-ecommerce' THEN 'Digital E-Commerce'
        WHEN 'food-and-beverage' THEN 'Food & Beverage'
        WHEN 'mobile-services' THEN 'Mobile Services'
        ELSE 'Other'
      END, 'Other'),
    NEW.id,
    COALESCE(NEW.category, 'other'),
    'new',
    'open',
    'default',
    0,
    10
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_create_deal
  AFTER INSERT ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_deal_for_customer();

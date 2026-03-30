
-- Add 'funnel_lead' to lw_sellers source options (no constraint to change, source is just text)
-- Create trigger function: when a new lead is inserted into lw_landing_leads,
-- auto-create a corresponding lw_sellers row with source='funnel_lead'

CREATE OR REPLACE FUNCTION public.sync_landing_lead_to_seller()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _page_name text;
  _page_slug text;
  _address_parts text[];
  _city text;
  _state text;
  _zip text;
BEGIN
  -- Get landing page info for notes
  SELECT client_name, slug INTO _page_name, _page_slug
  FROM public.lw_landing_pages
  WHERE id = NEW.landing_page_id;

  -- Try to parse city/state/zip from property_address (best effort)
  -- Format: "123 Main St, City, ST 12345"
  _address_parts := string_to_array(NEW.property_address, ',');
  IF array_length(_address_parts, 1) >= 2 THEN
    _city := trim(_address_parts[array_length(_address_parts, 1) - 1]);
    -- Try to extract state + zip from last part
    _state := trim(substring(trim(_address_parts[array_length(_address_parts, 1)]) from '^\s*([A-Za-z]{2})'));
    _zip := trim(substring(trim(_address_parts[array_length(_address_parts, 1)]) from '(\d{5})'));
  END IF;

  -- Insert into lw_sellers, skip if phone already exists for funnel_lead source
  INSERT INTO public.lw_sellers (
    owner_name,
    owner_phone,
    owner_email,
    address_full,
    city,
    state,
    zip,
    asking_price,
    source,
    status,
    deal_type,
    property_type,
    notes,
    meta
  ) VALUES (
    NEW.full_name,
    NEW.phone,
    NEW.email,
    NEW.property_address,
    _city,
    _state,
    _zip,
    NEW.asking_price,
    'funnel_lead',
    'funnel_lead',
    'home',
    'SFR',
    'Funnel lead from ' || COALESCE(_page_name, 'landing page') || '. Timeline: ' || COALESCE(NEW.timeline, 'N/A') || '. Condition: ' || COALESCE(NEW.property_condition, 'N/A') || '. Motivation: ' || COALESCE(NEW.motivation, 'N/A'),
    jsonb_build_object(
      'landing_lead_id', NEW.id,
      'landing_page_id', NEW.landing_page_id,
      'landing_page_name', _page_name,
      'landing_page_slug', _page_slug,
      'lead_score', NEW.lead_score,
      'timeline', NEW.timeline,
      'property_condition', NEW.property_condition,
      'motivation', NEW.motivation
    )
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

-- Create trigger on lw_landing_leads
DROP TRIGGER IF EXISTS trg_sync_landing_lead_to_seller ON public.lw_landing_leads;
CREATE TRIGGER trg_sync_landing_lead_to_seller
  AFTER INSERT ON public.lw_landing_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_landing_lead_to_seller();

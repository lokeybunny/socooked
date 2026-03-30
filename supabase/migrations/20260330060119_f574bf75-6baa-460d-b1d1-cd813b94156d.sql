
-- Drop and recreate the trigger function with better address parsing and AI distress scoring
CREATE OR REPLACE FUNCTION public.sync_landing_lead_to_seller()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _page_name text;
  _page_slug text;
  _city text;
  _state text;
  _zip text;
  _addr_clean text;
  _parts text[];
  _last_part text;
  _second_last text;
  _motivation_score integer := 0;
  _distress_grade text;
  _lead_temp text;
  _has_ai_data boolean := false;
  _condition_notes text;
  -- US state abbreviations lookup
  _state_abbrevs text[] := ARRAY[
    'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
    'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
    'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
    'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
    'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'
  ];
BEGIN
  -- Get landing page info
  SELECT client_name, slug INTO _page_name, _page_slug
  FROM public.lw_landing_pages
  WHERE id = NEW.landing_page_id;

  -- ============================================
  -- SMART ADDRESS PARSING
  -- ============================================
  _addr_clean := trim(NEW.property_address);
  
  -- Normalize: replace periods and extra spaces
  _addr_clean := regexp_replace(_addr_clean, '\.', ' ', 'g');
  _addr_clean := regexp_replace(_addr_clean, '\s+', ' ', 'g');
  _addr_clean := trim(_addr_clean);

  -- Try to extract ZIP code (5 digits, optionally with -4)
  _zip := (regexp_match(_addr_clean, '\b(\d{5})(?:-\d{4})?\s*$'))[1];
  IF _zip IS NOT NULL THEN
    _addr_clean := trim(regexp_replace(_addr_clean, '\s*\d{5}(?:-\d{4})?\s*$', ''));
  END IF;

  -- Try to extract state abbreviation (last word or after last comma)
  -- First try: after last comma
  IF _addr_clean ~ ',' THEN
    _parts := string_to_array(_addr_clean, ',');
    _last_part := trim(_parts[array_length(_parts, 1)]);
    
    -- Check if last part is or starts with a state abbreviation
    IF upper(split_part(_last_part, ' ', 1)) = ANY(_state_abbrevs) THEN
      _state := upper(split_part(_last_part, ' ', 1));
      -- If there's more after state in that segment, it might be zip (already extracted)
      -- City is second-to-last comma segment
      IF array_length(_parts, 1) >= 2 THEN
        _city := trim(_parts[array_length(_parts, 1) - 1]);
      END IF;
    ELSIF upper(_last_part) = ANY(_state_abbrevs) THEN
      _state := upper(_last_part);
      IF array_length(_parts, 1) >= 2 THEN
        _city := trim(_parts[array_length(_parts, 1) - 1]);
      END IF;
    ELSE
      -- Last comma part might be "City ST" or just city
      -- Check if last word of last part is a state
      IF upper((regexp_match(_last_part, '\s+([A-Za-z]{2})$'))[1]) = ANY(_state_abbrevs) THEN
        _state := upper((regexp_match(_last_part, '\s+([A-Za-z]{2})$'))[1]);
        _city := trim(regexp_replace(_last_part, '\s+[A-Za-z]{2}$', ''));
      ELSE
        _city := _last_part;
      END IF;
    END IF;
  ELSE
    -- No commas: try to parse "123 Street Dr City ST" or "123 Street Dr City State"
    -- Extract state: last 2-letter word that matches a state abbreviation
    IF upper((regexp_match(_addr_clean, '\s+([A-Za-z]{2})$'))[1]) = ANY(_state_abbrevs) THEN
      _state := upper((regexp_match(_addr_clean, '\s+([A-Za-z]{2})$'))[1]);
      _addr_clean := trim(regexp_replace(_addr_clean, '\s+[A-Za-z]{2}$', ''));
      
      -- Now try to find city: everything after common street suffixes
      -- Look for known street type words and take everything after as city
      _city := (regexp_match(_addr_clean, '(?:dr|drive|st|street|ave|avenue|blvd|boulevard|rd|road|ln|lane|ct|court|way|pl|place|cir|circle|pkwy|parkway|ter|terrace|trl|trail|creek)\s+(.+)$', 'i'))[1];
      
      -- If no street suffix found, try taking last 1-2 words as city
      IF _city IS NULL THEN
        -- Take last two words as potential city name (e.g. "Las Vegas", "San Antonio")
        _city := (regexp_match(_addr_clean, '\s+(\S+\s+\S+)$'))[1];
      END IF;
    END IF;
  END IF;

  -- Title-case city
  IF _city IS NOT NULL THEN
    _city := initcap(trim(_city));
  END IF;

  -- ============================================
  -- AI-BASED DISTRESS SCORING FROM CALL DATA
  -- ============================================
  -- Check if AI has talked with customer
  _has_ai_data := (
    NEW.vapi_call_status = 'completed' AND 
    (NEW.motivation IS NOT NULL OR NEW.property_condition IS NOT NULL OR NEW.timeline IS NOT NULL)
  );

  IF _has_ai_data THEN
    -- Timeline scoring
    IF lower(COALESCE(NEW.timeline, '')) IN ('asap', 'immediately', 'urgent', 'this week') THEN
      _motivation_score := _motivation_score + 25;
    ELSIF lower(COALESCE(NEW.timeline, '')) IN ('1-2 weeks', '2 weeks', 'soon', 'this month', '30 days') THEN
      _motivation_score := _motivation_score + 15;
    ELSIF NEW.timeline IS NOT NULL AND NEW.timeline != '' THEN
      _motivation_score := _motivation_score + 8;
    END IF;

    -- Property condition scoring
    IF lower(COALESCE(NEW.property_condition, '')) IN ('major repairs', 'needs major work', 'tear down', 'condemned', 'uninhabitable') THEN
      _motivation_score := _motivation_score + 20;
      _condition_notes := 'Major repairs needed';
    ELSIF lower(COALESCE(NEW.property_condition, '')) IN ('needs work', 'needs repairs', 'minor repairs', 'cosmetic') THEN
      _motivation_score := _motivation_score + 12;
      _condition_notes := 'Needs work';
    ELSIF lower(COALESCE(NEW.property_condition, '')) IN ('good', 'great', 'excellent', 'move-in ready') THEN
      _motivation_score := _motivation_score + 5;
      _condition_notes := 'Good condition';
    END IF;

    -- Motivation keyword scoring
    IF lower(COALESCE(NEW.motivation, '')) ~ '(financial|debt|foreclosure|behind on|tax lien|bankruptcy)' THEN
      _motivation_score := _motivation_score + 25;
    END IF;
    IF lower(COALESCE(NEW.motivation, '')) ~ '(divorce|inherited|probate|death|estate)' THEN
      _motivation_score := _motivation_score + 20;
    END IF;
    IF lower(COALESCE(NEW.motivation, '')) ~ '(relocat|moving|job transfer|military)' THEN
      _motivation_score := _motivation_score + 15;
    END IF;
    IF lower(COALESCE(NEW.motivation, '')) ~ '(urgent|desperate|need to sell|must sell|asap)' THEN
      _motivation_score := _motivation_score + 15;
    END IF;
    IF lower(COALESCE(NEW.motivation, '')) ~ '(vacant|empty|not living|tenant|rental)' THEN
      _motivation_score := _motivation_score + 10;
    END IF;

    -- Also scan ai_notes for distress signals
    IF lower(COALESCE(NEW.ai_notes, '')) ~ '(financial|debt|foreclosure|behind on payments|tax)' THEN
      _motivation_score := _motivation_score + 10;
    END IF;
    IF lower(COALESCE(NEW.ai_notes, '')) ~ '(vacant|abandoned|not living|needs.+repair)' THEN
      _motivation_score := _motivation_score + 8;
    END IF;
    IF lower(COALESCE(NEW.ai_notes, '')) ~ '(urgent|quick|fast|asap|immediately)' THEN
      _motivation_score := _motivation_score + 8;
    END IF;

    -- Cap at 100
    _motivation_score := LEAST(_motivation_score, 100);
  END IF;
  -- If AI has NOT talked with the customer, score stays 0

  -- Grade and temperature
  IF _motivation_score >= 70 THEN
    _distress_grade := 'A';
    _lead_temp := 'Hot';
  ELSIF _motivation_score >= 45 THEN
    _distress_grade := 'B';
    _lead_temp := 'Warm';
  ELSIF _motivation_score >= 20 THEN
    _distress_grade := 'C';
    _lead_temp := 'Warm';
  ELSIF _motivation_score > 0 THEN
    _distress_grade := 'D';
    _lead_temp := 'Cold';
  ELSE
    _distress_grade := NULL;
    _lead_temp := NULL;
  END IF;

  -- Insert into lw_sellers
  INSERT INTO public.lw_sellers (
    owner_name, owner_phone, owner_email, address_full,
    city, state, zip,
    asking_price, source, status, deal_type, property_type,
    motivation_score, distress_grade, lead_temperature,
    condition_notes, notes, meta
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
    _motivation_score,
    _distress_grade,
    _lead_temp,
    _condition_notes,
    'Funnel lead from ' || COALESCE(_page_name, 'landing page') ||
      '. Timeline: ' || COALESCE(NEW.timeline, 'N/A') ||
      '. Condition: ' || COALESCE(NEW.property_condition, 'N/A') ||
      '. Motivation: ' || COALESCE(NEW.motivation, 'N/A'),
    jsonb_build_object(
      'landing_lead_id', NEW.id,
      'landing_page_id', NEW.landing_page_id,
      'landing_page_name', _page_name,
      'landing_page_slug', _page_slug,
      'lead_score', NEW.lead_score,
      'timeline', NEW.timeline,
      'property_condition', NEW.property_condition,
      'motivation', NEW.motivation,
      'ai_notes', NEW.ai_notes,
      'vapi_call_status', NEW.vapi_call_status
    )
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$function$;

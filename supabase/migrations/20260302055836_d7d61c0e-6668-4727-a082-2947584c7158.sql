
CREATE OR REPLACE FUNCTION public.trigger_light_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _payload jsonb;
  _url text;
  _anon_key text;
  _response extensions.http_response;
BEGIN
  _payload := jsonb_build_object(
    'record', jsonb_build_object(
      'id', NEW.id,
      'ca_address', NEW.ca_address
    )
  );

  _url := 'https://mziuxsfxevjnmdwnrqjs.supabase.co/functions/v1/moralis-light-audit';
  _anon_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16aXV4c2Z4ZXZqbm1kd25ycWpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNjgzMzQsImV4cCI6MjA4Njc0NDMzNH0.APi_x5YBKa8bOKpjLGiJUBB5qxi3rKKxWiApQAlf78c';

  SELECT * INTO _response FROM extensions.http((
    'POST',
    _url,
    ARRAY[
      extensions.http_header('apikey', _anon_key),
      extensions.http_header('Authorization', 'Bearer ' || _anon_key),
      extensions.http_header('Content-Type', 'application/json')
    ],
    'application/json',
    _payload::text
  )::extensions.http_request);

  RETURN NEW;
END;
$function$;

CREATE TRIGGER on_market_cap_alert_insert
  AFTER INSERT ON public.market_cap_alerts
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_light_audit();

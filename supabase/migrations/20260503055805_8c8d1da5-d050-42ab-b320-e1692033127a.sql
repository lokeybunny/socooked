CREATE OR REPLACE FUNCTION public.auto_send_deposit_on_proposal_signed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _url text;
  _anon_key text;
  _payload jsonb;
BEGIN
  IF NEW.status = 'signed' AND (OLD.status IS DISTINCT FROM 'signed') THEN
    IF NEW.client_email IS NULL OR NEW.client_email = '' THEN
      RETURN NEW;
    END IF;
    IF (NEW.meta ->> 'deposit_email_sent_at') IS NOT NULL THEN
      RETURN NEW;
    END IF;

    _url := 'https://mziuxsfxevjnmdwnrqjs.supabase.co/functions/v1/proposal-deposit-send';
    _anon_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16aXV4c2Z4ZXZqbm1kd25ycWpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNjgzMzQsImV4cCI6MjA4Njc0NDMzNH0.APi_x5YBKa8bOKpjLGiJUBB5qxi3rKKxWiApQAlf78c';
    _payload := jsonb_build_object('id', NEW.id, 'auto', true);

    BEGIN
      PERFORM net.http_post(
        url := _url,
        headers := jsonb_build_object(
          'apikey', _anon_key,
          'Authorization', 'Bearer ' || _anon_key,
          'Content-Type', 'application/json'
        ),
        body := _payload,
        timeout_milliseconds := 30000
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'auto_send_deposit_on_proposal_signed pg_net error: %', SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$function$;
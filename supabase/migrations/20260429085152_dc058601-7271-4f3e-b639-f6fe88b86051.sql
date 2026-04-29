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
  _response extensions.http_response;
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
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'auto_send_deposit_on_proposal_signed http error: %', SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_auto_send_deposit_on_proposal_signed ON public.proposals;
CREATE TRIGGER trg_auto_send_deposit_on_proposal_signed
AFTER UPDATE OF status ON public.proposals
FOR EACH ROW
EXECUTE FUNCTION public.auto_send_deposit_on_proposal_signed();
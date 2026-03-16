
-- Trigger function to call ringcentral-recordings when status changes to 'prospect'
CREATE OR REPLACE FUNCTION public.trigger_rc_recordings_on_prospect()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _url text;
  _anon_key text;
BEGIN
  -- Only fire when status changes TO 'prospect'
  IF NEW.status = 'prospect' AND (OLD.status IS DISTINCT FROM 'prospect') AND NEW.phone IS NOT NULL AND NEW.phone != '' THEN
    _url := current_setting('app.settings.supabase_url', true);
    _anon_key := current_setting('app.settings.anon_key', true);

    -- If settings not available, try from vault
    IF _url IS NULL OR _url = '' THEN
      SELECT decrypted_secret INTO _url FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;
    END IF;
    IF _anon_key IS NULL OR _anon_key = '' THEN
      SELECT decrypted_secret INTO _anon_key FROM vault.decrypted_secrets WHERE name = 'anon_key' LIMIT 1;
    END IF;

    -- Fire async HTTP call to the edge function
    IF _url IS NOT NULL AND _url != '' THEN
      PERFORM extensions.http_post(
        _url || '/functions/v1/ringcentral-recordings',
        json_build_object('action', 'pull', 'customer_id', NEW.id)::text,
        'application/json'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Create the trigger
DROP TRIGGER IF EXISTS trg_rc_recordings_on_prospect ON public.customers;
CREATE TRIGGER trg_rc_recordings_on_prospect
  AFTER UPDATE OF status ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_rc_recordings_on_prospect();

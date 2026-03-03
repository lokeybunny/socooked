
CREATE OR REPLACE FUNCTION public.notify_top_gainer()
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
  _token_label text;
  _ticker_label text;
BEGIN
  -- Only fire when is_top_gainer changes from false to true
  IF NEW.is_top_gainer = true AND (OLD.is_top_gainer IS DISTINCT FROM true) THEN

    _token_label := COALESCE(NEW.token_name, 'Unknown');
    _ticker_label := COALESCE(NEW.token_symbol, '???');

    _payload := jsonb_build_object(
      'entity_type', 'top_gainer',
      'action', 'created',
      'meta', jsonb_build_object(
        'message', '🏆 *TOP GAINER ALERT*' || chr(10) ||
          '🪙 *' || _token_label || '* ($' || _ticker_label || ')' || chr(10) ||
          '📈 Reached TP#10+ — Elite Status' || chr(10) ||
          '🔗 [pump.fun](https://pump.fun/coin/' || NEW.ca_address || ')' || chr(10) ||
          '🔗 [DexScreener](https://dexscreener.com/solana/' || NEW.ca_address || ')',
        'ca_address', NEW.ca_address,
        'ticker', _ticker_label,
        'milestone', NEW.milestone
      )
    );

    _url := 'https://mziuxsfxevjnmdwnrqjs.supabase.co/functions/v1/telegram-notify';
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

  END IF;

  RETURN NEW;
END;
$function$;

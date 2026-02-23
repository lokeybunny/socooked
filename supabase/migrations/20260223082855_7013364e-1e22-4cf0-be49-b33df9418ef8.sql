
-- Enable pg_net extension for HTTP calls from triggers
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Function to call telegram-notify edge function
CREATE OR REPLACE FUNCTION public.notify_telegram()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _payload jsonb;
  _url text;
  _anon_key text;
BEGIN
  _payload := jsonb_build_object(
    'record', jsonb_build_object(
      'id', NEW.id,
      'entity_type', NEW.entity_type,
      'entity_id', NEW.entity_id,
      'action', NEW.action,
      'actor_id', NEW.actor_id,
      'meta', NEW.meta,
      'created_at', NEW.created_at
    )
  );

  _url := 'https://mziuxsfxevjnmdwnrqjs.supabase.co/functions/v1/telegram-notify';
  _anon_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16aXV4c2Z4ZXZqbm1kd25ycWpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNjgzMzQsImV4cCI6MjA4Njc0NDMzNH0.APi_x5YBKa8bOKpjLGiJUBB5qxi3rKKxWiApQAlf78c';

  PERFORM extensions.http_post(
    _url,
    _payload::text,
    'application/json',
    ARRAY[
      extensions.http_header('apikey', _anon_key),
      extensions.http_header('Authorization', 'Bearer ' || _anon_key)
    ],
    5000
  );

  RETURN NEW;
END;
$$;

-- Create trigger on activity_log
CREATE TRIGGER trg_telegram_notify
AFTER INSERT ON public.activity_log
FOR EACH ROW
EXECUTE FUNCTION public.notify_telegram();

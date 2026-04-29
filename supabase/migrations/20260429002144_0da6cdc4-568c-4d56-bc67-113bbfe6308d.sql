-- Ensure pg_cron + pg_net are enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove old job if it exists so this is re-runnable
DO $$
BEGIN
  PERFORM cron.unschedule('twilio-inbound-poll-30s');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'twilio-inbound-poll-30s',
  '*/1 * * * *',  -- every minute (Twilio API rate-friendly; manual button covers in-between)
  $$
  SELECT net.http_post(
    url := 'https://mziuxsfxevjnmdwnrqjs.supabase.co/functions/v1/twilio-inbound-poll',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16aXV4c2Z4ZXZqbm1kd25ycWpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNjgzMzQsImV4cCI6MjA4Njc0NDMzNH0.APi_x5YBKa8bOKpjLGiJUBB5qxi3rKKxWiApQAlf78c"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
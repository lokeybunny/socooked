
CREATE TABLE IF NOT EXISTS public.xitbot_poll_state (
  channel_id text PRIMARY KEY,
  last_message_id text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.xitbot_poll_state TO service_role;
ALTER TABLE public.xitbot_poll_state ENABLE ROW LEVEL SECURITY;
-- service_role bypasses RLS; no client policies needed.

INSERT INTO public.xitbot_poll_state (channel_id) VALUES ('1512253930917068913')
ON CONFLICT (channel_id) DO NOTHING;

-- Schedule pg_cron job to poll every minute
SELECT cron.schedule(
  'xitbot-channel-poll-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://mziuxsfxevjnmdwnrqjs.supabase.co/functions/v1/xitbot-channel-poll',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16aXV4c2Z4ZXZqbm1kd25ycWpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNjgzMzQsImV4cCI6MjA4Njc0NDMzNH0.APi_x5YBKa8bOKpjLGiJUBB5qxi3rKKxWiApQAlf78c"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

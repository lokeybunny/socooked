-- Schedule VoidFix inbound SMS polling every minute (webhook is unreliable)
SELECT cron.unschedule('voidfix-sms-poll') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'voidfix-sms-poll');

SELECT cron.schedule(
  'voidfix-sms-poll',
  '* * * * *',
  $$
  SELECT extensions.http_post(
    'https://mziuxsfxevjnmdwnrqjs.supabase.co/functions/v1/powerdial-sms',
    '{"action":"poll","limit":50}',
    'application/json'
  );
  $$
);
SELECT cron.unschedule('land-reapi-search-daily');
SELECT cron.unschedule('land-skip-trace-daily');
SELECT cron.unschedule('land-match-engine-daily');
SELECT cron.unschedule('land-call-queue-daily');
SELECT cron.unschedule('land-daily-summary');
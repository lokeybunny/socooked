# v0-poll-cron

Automatic v0.dev preview polling via Supabase Cron.

## Version

1.0.0

## Description

Enhances the existing `/v0-poll` edge function with scheduled cron execution. Every 60 seconds, `pg_cron` triggers `pg_net` to call the v0-poll endpoint, which checks all `api_previews` rows with `status = 'generating'` against the v0.dev API and updates them when a `preview_url` becomes available.

## Architecture

```
pg_cron (every 60s)
  → pg_net HTTP POST
    → /functions/v1/v0-poll
      → SELECT * FROM api_previews WHERE status = 'generating'
      → For each: check v0.dev API
      → UPDATE api_previews SET status = 'done', preview_url = '...'
```

## Cron Job

| Field | Value |
|-------|-------|
| Job name | `v0-poll-every-30s` |
| Schedule | `*/1 * * * *` (every 60 seconds) |
| Method | `pg_net.http_post` |
| Target | `https://mziuxsfxevjnmdwnrqjs.supabase.co/functions/v1/v0-poll` |
| Auth | Internal header `x-internal: true` (no bot secret required) |

### SQL to Enable

```sql
select cron.schedule(
  'v0-poll-every-30s',
  '*/1 * * * *',
  $$
  select net.http_post(
    url:='https://mziuxsfxevjnmdwnrqjs.supabase.co/functions/v1/v0-poll',
    headers:='{"Content-Type": "application/json", "x-internal": "true"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);
```

### SQL to Disable

```sql
select cron.unschedule('v0-poll-every-30s');
```

## Edge Function Config

```toml
[functions.v0-poll]
verify_jwt = false
```

## Future: Telegram Notifications

When ready, add `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` as secrets. The v0-poll function will be updated to send a message when a preview completes:

```
✅ Site ready for [Customer]!
🔗 Preview: https://v0.dev/chat/...
```

## Dependencies

- `pg_cron` extension (enabled in Supabase)
- `pg_net` extension (enabled in Supabase)
- Existing `v0-poll` edge function
- `api_previews` table

## Install

Already deployed via Lovable Cloud. Enable the cron job by running the SQL above in the database console.

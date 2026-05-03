# LeadsRain Analytics — Live Operations Monitor

Build a polling-based campaign monitoring system at **Phone System → LeadsRain Analytics**. Replaces the current ad-hoc Voice Drops fetch with a scalable cron-driven sync, persistent analytics, and a real-feeling live dashboard.

## Architecture

```
LeadsRain API (HTTP, blocked direct)
        │
        ▼
Cloudflare Worker proxy  (LEADSRAIN_PROXY_URL — already set)
        │
        ▼
Edge fn: leadsrain-poll-sync   ──► writes to DB
        │  (pg_cron every 1 min, configurable)
        ▼
Tables: lr_campaigns, lr_campaign_snapshots, lr_sync_logs, lr_sync_config
        │
        ▼
Frontend /leadsrain-analytics  (auto-refreshes 30s, Realtime subscribe)
```

All reads in the UI hit the **CRM database**, not LeadsRain. The poller is the only thing that talks to LeadsRain — collisions prevented by a `pg_try_advisory_lock`.

## Database (single migration)

- **lr_campaigns** — one row per LeadsRain campaign. Columns: `campaign_id` (unique), `campaign_name`, `caller_id`, `list_id`, `status`, `total_leads`, `processed_leads`, `delivered_leads`, `failed_leads`, `remaining_leads`, `completion_percentage`, `started_at`, `last_synced_at`, `estimated_completion_at`, `raw` (jsonb), timestamps.
- **lr_campaign_snapshots** — historical time-series for trend charts. `campaign_id`, `snapshot_at`, `processed`, `delivered`, `failed`, `remaining`, `status`. Indexed on `(campaign_id, snapshot_at desc)`.
- **lr_sync_logs** — every poll run. `sync_id`, `started_at`, `finished_at`, `duration_ms`, `status` (success/partial/failed), `campaigns_seen`, `campaigns_changed`, `error`, `http_status`.
- **lr_sync_config** — singleton row: `interval_minutes`, `enabled`, `last_run_at`, `next_run_at`.
- RLS: read = authenticated; writes = service role only (poller).
- Realtime publication on `lr_campaigns` + `lr_sync_logs` so the UI live-updates without polling the DB.
- Enable `pg_cron` + `pg_net`; schedule job calling the poller every minute (it self-throttles via `lr_sync_config.interval_minutes`).

## Edge Functions

1. **leadsrain-poll-sync** (cron-triggered, also callable manually)
   - Acquires advisory lock → exits if already running.
   - Reads `lr_sync_config`; skips if `now() < next_run_at`.
   - Fetches campaign list via proxy (reuses existing `_shared/leadsrainClient.ts`), then enriches each campaign with detail/lead-stats endpoints.
   - Diffs vs `lr_campaigns`; upserts changed rows; inserts a snapshot when counts move.
   - Computes `completion_percentage`, `remaining_leads`, and `estimated_completion_at` (linear extrapolation from last 3 snapshots).
   - Writes `lr_sync_logs` row; updates `last_run_at` / `next_run_at`.
   - Emits structured retry on transient failure (max 3, exponential backoff).

2. **leadsrain-sync-config** — GET/POST to read/update interval + enable flag from the UI.

3. **leadsrain-poll-now** — admin button → invokes poll-sync immediately, bypassing throttle.

## Frontend — `/leadsrain-analytics`

Route added under sidebar group **Phone System**. Existing `/voice-drops` stays but is demoted; new page is the primary surface.

Layout (dark glass, neon-lime accents, framer-motion):

- **Header bar**: Title, "Last sync: 12s ago", live pulse dot, Sync Now button, interval selector (1/5/15 min), enable toggle.
- **Metrics row** (animated counters): Total / Active / Completed Today / Failed / Total Leads Processed / Total Voicemails Sent / Avg Completion % / API Health.
- **Alerts strip**: failed campaigns, stuck (no progress >30 min while active), sync failures in last hour.
- **Campaigns table** (TanStack-style, sortable / searchable / filter chips for status / pagination):
  Campaign · ID · Status badge · Leads · Processed · Success% · Failed% · Remaining · Started · Last Updated · ETA · Sync.
- **Drawer / detail page** on row click: overview, large progress ring, line chart of processed-vs-time from `lr_campaign_snapshots` (recharts), polling activity panel from `lr_sync_logs` filtered to that campaign.
- **Auto-refresh**: Supabase Realtime subscription on `lr_campaigns` + `lr_sync_logs`; fallback `setInterval(45s)`. Smooth row-level fade on change.

Status color map: completed=green, active/processing=lime-glow, paused=amber, failed/cancelled=red, queued/pending=slate.

## Files Touched / Created

**New**
- `supabase/functions/leadsrain-poll-sync/index.ts`
- `supabase/functions/leadsrain-sync-config/index.ts`
- `supabase/functions/leadsrain-poll-now/index.ts`
- `src/pages/LeadsRainAnalytics.tsx`
- `src/components/leadsrain/MetricsRow.tsx`
- `src/components/leadsrain/CampaignsTable.tsx`
- `src/components/leadsrain/CampaignDetailDrawer.tsx`
- `src/components/leadsrain/SyncControlBar.tsx`
- `src/components/leadsrain/AlertsStrip.tsx`
- `src/lib/leadsrainAnalytics.ts` (queries, types, formatters)

**Modified**
- `src/App.tsx` — add route `/leadsrain-analytics`.
- `src/components/layout/Sidebar.tsx` — add nav item under Phone System group.
- One DB migration + one `supabase.insert` for the cron schedule (per project rules).

## Out of Scope (kept future-ready, not built)
Webhook receiver, Twilio cross-stitch, SMS analytics, lead-level drill-down, multi-provider abstraction. Tables are designed so these slot in without schema breaks.

## Overview

Replace Drop.co VMDrop with **LeadsRain RVM** (campaign-based ringless voicemail), keep VoidFix as the SMS layer, and wire `LeadsRain "lead accepted" → VoidFix SMS follow-up`. All API calls server-side; secrets `LEADSRAIN_API_KEY` + `LEADSRAIN_USERNAME` already saved.

> **Important reality check:** LeadsRain RVM has no "send-one-drop-now" endpoint and no public per-drop status/webhook. Their model is: pre-build a campaign + audio + caller ID in their dashboard, then post leads into a list. CRM stores the campaign ID and posts leads on click. Per-drop "delivered" data is best-effort (View Campaign reporting only). Webhook function is built but only fires if your LeadsRain plan ever pushes one. Per your decision, **VoidFix SMS fires on successful lead post** (not on confirmed VM delivery), since confirmed delivery isn't reliably available.

## 1. Database (single migration)

**`leadsrain_campaigns`** — saved references to pre-built LeadsRain campaigns
- `campaign_name`, `caller_id`, `audio_url` (display only), `transfer_number`, `is_active` (one default), `provider_campaign_id`, `provider_list_id`, `raw_response`, `meta jsonb`

**`leadsrain_settings`** (singleton row) — global config
- `default_campaign_id` (FK), `default_caller_id`, `enable_voidfix_followup` (bool, default true), `voidfix_template` (text, default `"Hey, this is Warren — just left you a quick voicemail."`), `enable_transfer` (bool), `transfer_number`

**`leadsrain_drops`** — one row per send attempt
- `lead_id`, `customer_id`, `campaign_id` (FK), `phone_number`, `caller_id`, `status` (queued|sent|delivered|failed|pending|rejected|unknown), `provider_lead_id`, `provider_campaign_id`, `provider_list_id`, `error_message`, `voidfix_sms_sent_at`, `voidfix_sms_message_id`, `raw_request jsonb`, `raw_response jsonb`
- Unique idempotency index on `(phone_number, campaign_id, date_trunc('hour', created_at))` to prevent dup sends

**`lead_timeline_events`** — universal CRM timeline
- `lead_id` (uuid, nullable), `customer_id` (uuid, nullable), `event_type` (`voice_drop_queued|voice_drop_sent|voice_drop_delivered|voice_drop_failed|voidfix_sms_sent|voidfix_sms_failed`), `event_title`, `event_description`, `provider` (`leadsrain|voidfix`), `provider_record_id`, `metadata jsonb`

**RLS:** `authenticated` SELECT on all four; INSERT/UPDATE/DELETE only via service role (edge functions).

## 2. Hard-remove Drop.co

Delete files:
- `src/pages/VMDrp.tsx`, `src/components/phone/VMDropPanel.tsx`, `src/lib/dropVm.ts`
- `supabase/functions/drop-vm/`, `supabase/functions/drop-webhook/`, `supabase/functions/dropco-webhook/`

Edit:
- `src/App.tsx` — remove VMDrp import + `/vmdrp` route
- `src/components/layout/Sidebar.tsx` — remove `/vmdrp` entry, replace with `/voice-drops` (LeadsRain)
- `src/pages/Phone.tsx` — remove `VMDropPanel` import + render
- `src/components/phone/SmsThreadPopup.tsx` — replace "Drop VM" button to call new LeadsRain modal trigger
- Delete deployed functions via `supabase--delete_edge_functions(["drop-vm","drop-webhook","dropco-webhook"])`

`DROP_API_KEY` secret stays (harmless), but unused.

## 3. Edge functions (4 new + 1 shared client)

**`_shared/leadsrainClient.ts`** (helper, not deployed standalone)
- `testConnection()` — POST `view/campaign_api` with username+api_key, returns parsed list
- `postLead({ campaign_id, list_id, phone, first_name, last_name, ... })` — POST `ringless/api/add_posted_lead.php`
- `viewCampaign(campaign_id)` — POST `rvm/api/campaign/view_api`
- `viewList(list_id)` — POST `rvm/api/leadlist/view_api`
- `normalizeStatus(raw)` → `queued|sent|delivered|failed|pending|rejected|unknown`

**`leadsrain-test-connection`** (POST `{}`) — calls View Campaign with creds, returns success+raw.

**`leadsrain-send-voicedrop`** (POST `{ customer_id?, lead_id?, phone_number, campaign_id?, caller_id?, audio_url? }`)
1. JWT-validate (admin-only).
2. Validate phone (`+1XXXXXXXXXX` E.164), look up campaign (defaults to `is_active`), check opt-out flag on customer if `customer_id` given.
3. Idempotency: reject if a `leadsrain_drops` row for same phone+campaign exists in last 30 minutes.
4. Insert `leadsrain_drops` row status=`queued` + timeline `voice_drop_queued`.
5. `leadsrainClient.postLead(...)` to LeadsRain.
6. Map response: success → status=`sent`, store `provider_lead_id`, `raw_response`. Add timeline `voice_drop_sent`.
7. **If success AND `enable_voidfix_followup=true` AND not opted-out:** invoke `powerdial-sms` with `{action:"send", to: phone, body: settings.voidfix_template, customer_id}`. Save `voidfix_sms_sent_at` + add timeline `voidfix_sms_sent`. Wrap in try/catch — VoidFix failure does NOT fail the drop, just logs `voidfix_sms_failed`.
8. Return `{ ok, drop_id, status, voidfix_sms_sent }`.

**`leadsrain-refresh-status`** (POST `{ drop_id }`)
- Calls `viewCampaign` and tries to match the lead by `provider_lead_id` (best-effort given API limits). Updates status + adds delivered/failed timeline event.
- Manual button on UI; also runnable on-demand from debug panel.

**`leadsrain-webhook`** (PUBLIC, no JWT — `verify_jwt = false` in config.toml)
- Accepts JSON or form-encoded payload. Matches drop by `provider_lead_id` OR phone+campaign within 24h. Updates status using `normalizeStatus`. Stores `raw_response`. Adds timeline event. Idempotent on `(drop_id, normalized_status)` — won't re-fire VoidFix since it already fired on send.

## 4. Frontend

**`src/lib/leadsrain.ts`** — typed wrappers around `supabase.functions.invoke` for all 4 fns.

**`src/pages/VoiceDrops.tsx`** (route `/voice-drops`, WarrenOnlyGate)
- Tabs: **Overview** (connection status badge, active campaign card, send-test button) | **Recent Drops** (table with retry + view-raw for admin) | **Failed** | **Stats** (counts by status, last 30 days) | **Debug** (raw last 20 responses + last 20 webhook payloads + retry buttons) | **Settings** (campaign list CRUD, default toggle, VoidFix follow-up toggle, template field, transfer number).
- Connection status: calls `leadsrain-test-connection` on load, shows green/red badge.

**`src/components/voicedrops/SendVoiceDropModal.tsx`** — re-usable modal (campaign select, phone, caller ID, audio URL preview from saved campaign, compliance checkbox, Send).
- Used by:
  - SmsThreadPopup "Drop VM" button (replaces Drop.co handler)
  - New "Send Voice Drop" button on customer profile (find existing customer detail page)
  - Bulk-send from leads list

**`src/components/voicedrops/BulkVoiceDropDialog.tsx`** — receives selected lead IDs, campaign select, mandatory compliance checkbox, fires sequentially with 1s spacing, progress bar, per-row result.

**Sidebar:** swap `/vmdrp` line for `{ to: '/voice-drops', icon: Voicemail, label: 'VDrops', green: true }`.

## 5. Status normalization map

```
delivered | success | completed | sent_to_voicemail → "delivered"
sent | dispatched | accepted                       → "sent"
queued | processing | pending_dispatch             → "queued"
pending                                             → "pending"
failed | error | rejected | invalid                 → "failed"
dnc | tcpa | scrub_blocked                          → "rejected"
*                                                   → "unknown"
```

## 6. Compliance & safety

- Customer opt-out: check `customers.meta->>'sms_opt_out' = 'true'` before sending VoidFix follow-up.
- Phone validation: must be 10-digit US after stripping non-digits; otherwise 400 with human-readable error.
- Bulk send: requires explicit "I confirm I have consent for these contacts" checkbox before submit; skips opted-out + invalid silently with per-row result.
- All raw API responses stored server-side only; UI only shows raw on admin debug view.

## 7. Test plan

1. After migration: open `/voice-drops`, hit Test Connection → expect green badge.
2. Add a campaign row referencing a campaign you've set up in LeadsRain dashboard, mark active.
3. Click "Send Test Drop" with your own phone → row appears in Recent Drops `sent`, voicemail arrives within campaign calltime, VoidFix SMS fires immediately.
4. Open SmsThreadPopup → Drop VM button now opens new modal, not Drop.co.
5. Bulk: select 2 leads, confirm compliance, send → 2 rows queued.

## 8. Out-of-scope / known limits

- Confirmed "delivered" status depends on whether your LeadsRain plan exposes per-lead reporting via `view_api`. If not, drops will stay at `sent` until/unless a webhook arrives. UI clearly labels `sent` vs `delivered`.
- Audio file upload itself stays in LeadsRain dashboard (their API requires the file to exist on a campaign before it can dispatch). CRM only references the audio URL for display.

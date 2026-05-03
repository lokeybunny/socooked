# Voice Drops Page — Full Rebuild Plan

## Goal
Replace the current `/voice-drops` page (and old Drop.co/Slybroadcast remnants) with a CRM-style **campaign performance dashboard** that orchestrates: LeadsRain RVM → Business Line 1 → Twilio callbacks → VoidFix missed-call SMS.

---

## 1. Database (single migration)

**New tables (will request approval before code changes):**

- `voice_drop_campaigns` — provider, campaign_name, leadsrain_campaign_id, leadsrain_list_id, campaign_cid, business_line_1, twilio_number, verizon_forward_number, sound_file_url, status, totals (leads/drops/delivered/callbacks/missed/answered/sms), conversion_rate, active_start_at, active_end_at, last_synced_at, notes, user_id, timestamps.
- `voice_drop_leads` — campaign_id FK, contact_id, phone_number, name/address fields, leadsrain_upload_status, leadsrain_response jsonb, error_message.
- `voice_drop_events` — campaign_id, lead_id, contact_id, phone_number, event_type, provider, event_source, raw_payload jsonb. Event types: lead_uploaded, campaign_created, drop_sent, callback_received, missed_call, answered_call, sms_auto_reply_sent, converted, not_interested.
- `voice_drop_settings` — single-row-per-user settings (LR creds reference, biz line, twilio fwd, verizon fwd, default cid, default sms, voidfix enabled, attribution_window_hours).

RLS: authenticated users only; standard owner policies. Indexes on campaign_id, phone_number (last 10), event_type, created_at.

**Migrate** any usable data from existing `leadsrain_campaigns` / `leadsrain_settings` into the new tables, then leave the old tables untouched (do not drop in this pass — safer).

---

## 2. Edge Functions

Create:
- `leadsrain-create-campaign` — POST to LR campaign add API; insert `voice_drop_campaigns` row; emit `campaign_created` event.
- `leadsrain-create-lead-list` — create LR list, store `leadsrain_list_id` on campaign.
- `leadsrain-upload-lead` — single lead post; persist response/status.
- `leadsrain-bulk-upload-leads` — accept CSV rows, loop with throttling, persist each result.
- `leadsrain-sync-campaign` — fetch LR stats, update counts + `last_synced_at`; mark delivered as **estimated**.
- `voicedrop-twilio-callback` — Twilio webhook (signature verify): match active campaign by attribution window + caller match; insert `callback_received` + `missed_call`/`answered_call` event; increment counters; if missed → call VoidFix.
- `voicedrop-voidfix-sms` — send default SMS via VoidFix; 10-min per-phone dedupe via `voice_drop_events`; increment `sms_replies_sent_count`.

All use existing `LEADSRAIN_USERNAME`/`LEADSRAIN_API_KEY`/`VOIDFIX_*`/`TWILIO_*` secrets. CORS on every response. Zod input validation. JWT validation in code.

---

## 3. Frontend — `src/pages/VoiceDrops.tsx` (full rewrite)

**Header**
- Title "Voice Drops" + subtitle describing LR → Biz Line 1 → Twilio → VoidFix flow.
- Buttons: New Campaign · Sync LeadsRain Data · Upload Leads · Settings.

**Overview cards (10):** Total Campaigns, Active, Leads Uploaded, Drops, Estimated Delivered, Callbacks, Missed, Answered, SMS Replies, Conversion Rate (callbacks/drops).

**Campaign table** with all 14 columns + row actions (View · Sync · Upload Leads · Pause/Archive · Export Report). Status badges, last-synced relative time.

**New Campaign modal** — fields per spec; on submit calls `leadsrain-create-campaign`.

**Upload Leads modal** — CSV drop + manual single-lead form; calls bulk endpoint; shows per-row status.

**Settings tab** — fields per spec; "Test LeadsRain", "Test Twilio Callback", "Test VoidFix" buttons calling existing/new test functions.

**Components extracted** (kept small):
- `components/voicedrops/CampaignTable.tsx`
- `components/voicedrops/NewCampaignDialog.tsx`
- `components/voicedrops/UploadLeadsDialog.tsx`
- `components/voicedrops/CampaignDetailDrawer.tsx` (tabs: Overview / Leads / Drops / Callbacks / Missed / SMS / Settings)
- `components/voicedrops/VoiceDropSettings.tsx`
- `components/voicedrops/OverviewCards.tsx`

**Detail drawer** — opens on "View Campaign". Pulls events + matched Twilio call_logs (campaign_source = LeadsRain). Callbacks tab includes Call Back / Text / Add to Power Dialer / Mark Converted / Mark Not Interested actions.

**Removal:** delete old Drop.co / Slybroadcast / token UI from `VoiceDrops.tsx`. Keep `BulkVoiceDropDialog` and `SendVoiceDropModal` only if they are still referenced elsewhere; otherwise prune imports here.

---

## 4. Twilio callback wiring

Update / extend the Twilio inbound-voice handler (existing function, identified during impl) to POST into `voicedrop-twilio-callback` (or call it inline) so every inbound call is matched against active LR campaigns within the attribution window.

---

## 5. Out of scope this pass
- Power Dialer integration beyond an "Add to Power Dialer" button that writes to existing PD queue.
- Revenue reporting (placeholder column, only filled if data exists).
- Dropping legacy `leadsrain_campaigns` / `leadsrain_settings` tables.

---

## Technical notes
- All LR/VoidFix calls server-side; no keys in browser.
- Conversion rate computed in SQL view or client from counters.
- VoidFix dedupe: `SELECT 1 FROM voice_drop_events WHERE event_type='sms_auto_reply_sent' AND phone_number=$1 AND created_at > now()-interval '10 minutes'`.
- Twilio webhook signature verified using `TWILIO_AUTH_TOKEN`.
- Attribution match order: (1) lead phone match → exact campaign, (2) most recent active campaign in window.
- Estimated delivered = drops_sent × configurable rate (default 0.85) until LR exposes real delivery.

---

## Deliverable order
1. Migration (await approval).
2. Edge functions (7 new).
3. Frontend rewrite + new components.
4. Wire Twilio handler.
5. Smoke test: create campaign → upload 1 lead → simulate callback → verify event + counters.

Approve this plan and I'll start with the migration.
## Phone Quality Gate — Twilio Lookup Audit System

Add a strict phone-quality gate that uses Twilio Lookup (carrier/line-type) to verify every number before it lands in `state_leads`. Includes a new admin "Phone Number Audit" page for cleaning existing data.

### Cost warning

Twilio Lookup with `LineTypeIntelligence` is **$0.008/lookup**. A 50k-lead CSV = ~$400. The system will:
- Cache results for 30 days (no re-billing for repeats)
- Show estimated cost **before** running and require confirmation
- Allow pause/resume on the admin audit

---

### 1. Database changes (migration)

**New table `phone_lookups`** (cache, deduped by E.164):
- `phone_e164` (PK), `valid`, `line_type` (mobile/landline/voip/unknown), `carrier_name`, `carrier_type`, `country_code`, `raw_response` (jsonb), `status` (success/failed), `checked_at`

**New table `rejected_leads`**:
- Mirror of `state_leads` core columns + `phone_raw`, `phone_normalized`, `phone_valid`, `phone_line_type`, `phone_carrier`, `phone_lookup_status`, `phone_lookup_checked_at`, `rejection_reason`, `import_batch_id`, `original_row` (jsonb), `created_at`
- RLS: authenticated only

**Add columns to `state_leads`**:
- `phone_line_type`, `phone_carrier`, `phone_lookup_status`, `phone_lookup_checked_at`, `import_batch_id`, `duplicate_of_lead_id`
- (`phone_e164` already unique — that's our enforcement)

### 2. Edge functions

**`twilio-lookup-batch`** (shared internal helper)
- Input: array of E.164 numbers
- Checks `phone_lookups` cache (≤30 days old) first
- Calls Twilio `https://lookups.twilio.com/v2/PhoneNumbers/{e164}?Fields=line_type_intelligence` for misses
- Concurrency: 10 parallel, retry 3x on 429/5xx with exponential backoff
- Upserts results to `phone_lookups`
- Returns map of `{e164 → {valid, line_type, carrier, status}}`

**`audit-uploaded-phone-numbers`** (replaces parsing path of `process-state-upload`)
- Accept CSV upload + `selected_state` + `import_batch_id` + `confirmed:boolean`
- Phase A (`confirmed=false`): parse, normalize, dedupe within file + against existing `state_leads`, run lookups, return audit summary (no writes to state_leads)
- Phase B (`confirmed=true`): re-fetch cached results, insert mobile-valid into `state_leads`, insert rejects into `rejected_leads`
- Stream progress via existing `upload:{progressId}` realtime broadcast (parsing/normalizing/looking-up/saving phases)

**`audit-existing-phone-numbers`**
- Body: `{ batch_id, action: 'start'|'pause'|'resume'|'status', batch_size: 200 }`
- Tracked in new `phone_audit_jobs` table (status, total, processed, mobile, landline, voip, invalid, unknown, failed, paused, started_at)
- Pulls un-audited or stale (>30d) `state_leads.phone_e164`, runs through `twilio-lookup-batch`, updates each lead with audit fields
- Polls itself via `EdgeRuntime.waitUntil` until job paused/done
- Marks duplicates (same `phone_e164` collisions don't exist — enforced — but flags any `phone_normalized` mismatches with `duplicate_of_lead_id`)

**`delete-non-mobile-leads`**
- Body: `{ confirm: true, dry_run?: boolean }`
- Moves all `state_leads` where `phone_line_type != 'mobile'` OR `phone_valid = false` into `rejected_leads`, then deletes from `state_leads`
- Returns count deleted

### 3. Frontend changes

**Update `src/pages/UsaMap.tsx`** (upload modal):
- New 2-step flow: upload → audit summary modal → confirm save
- Audit summary shows: total rows, unique numbers, mobile approved, duplicates removed, landlines/voip/invalid/unknown rejected, failed lookups, **estimated cost** ($0.008 × new lookups)
- Live progress phases (parsing → normalizing → deduping → twilio lookup → filtering → saving) with progress bar
- Buttons: "Save Mobile Leads Only", "Download Rejected CSV", "Download Full Audit CSV", "Cancel"

**New page `src/pages/PhoneAudit.tsx`** at `/phone-audit` (sidebar entry, admin-gated like other admin pages):
- Stats cards: total leads, unique numbers, audited, needing audit, mobile, landlines, voip, invalid, unknown, duplicates, est. cost
- Buttons: Start / Pause / Resume Audit, Delete Non-Mobile (with confirm dialog), Export Non-Mobile CSV, Export Full Audit CSV
- Live progress (poll `phone_audit_jobs` every 2s while running)

### 4. Cost-protection guardrails

- Audit summary modal **always shows estimated cost** before any write
- Existing-DB audit requires explicit "Start Audit" click + cost ack
- Cache reuse logs to console so user sees savings
- `phone_lookups` cache TTL = 30 days

### Out of scope (per your answers)

- Other tables (lw_sellers, sms_contacts, customers) — only `state_leads`
- Twilio Connector gateway — using existing TWILIO_ACCOUNT_SID/AUTH_TOKEN secrets

---

### Technical notes

- Twilio Lookup v2 endpoint: `GET https://lookups.twilio.com/v2/PhoneNumbers/{E164}?Fields=line_type_intelligence`
- Auth: HTTP Basic with `TWILIO_ACCOUNT_SID:TWILIO_AUTH_TOKEN`
- `line_type_intelligence.type` values: `mobile`, `landline`, `fixedVoip`, `nonFixedVoip`, `personal`, `tollFree`, `premium`, `sharedCost`, `uan`, `voicemail`, `unknown`
- We treat `mobile` as the only acceptable type; `fixedVoip`/`nonFixedVoip` rejected as voip; missing/null = unknown
- 404 from Twilio = invalid number
- Concurrency 10 keeps us under Twilio's default 100 req/s limit
- Background work in edge functions uses `EdgeRuntime.waitUntil` (already pattern in `process-state-upload`)

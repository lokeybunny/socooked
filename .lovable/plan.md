
## Hook Reply + DND System

Adds two new tabs to the `/sms` page and a backend automation that listens for replies to the "Warren Guru voicemail" auto-reply, classifies sentiment, routes negative replies to a DND list, and schedules a 72-hour Instagram follow-up for positive/neutral replies.

### 1. Database (migration)

New table `hook_reply_threads`:
- `id` uuid PK
- `phone` text (E.164, last-10 indexed)
- `phone_last10` text (generated/derived for fast lookup)
- `original_outbound_id` uuid — the auto-reply we're tracking (the Warren Guru hook)
- `inbound_message_id` uuid nullable — first inbound reply
- `sentiment` text: `pending` | `positive` | `neutral` | `negative`
- `status` text: `awaiting_reply` | `classified` | `followup_scheduled` | `followup_sent` | `dnd` | `cancelled`
- `followup_send_at` timestamptz nullable (set to inbound_at + 72h)
- `followup_sent_at` timestamptz nullable
- `dnd_reason` text nullable
- `meta` jsonb
- `created_at`, `updated_at`

New table `sms_dnd_list`:
- `id` uuid PK
- `phone` text, `phone_last10` text unique
- `reason` text (e.g. "STOP", "lose my number")
- `source` text ('hook_reply' | 'manual')
- `original_message_body` text nullable
- `created_at`

RLS: authenticated users can read/write both tables (matches existing PowerDial inbox model).

### 2. Hook detection

A message qualifies as a "hook outbound" if it's an outbound SMS via VoidFix whose body contains the Warren Guru voicemail phrase (matched case-insensitively, e.g. contains "warren guru" AND "voicemail"). When detected, we insert a `hook_reply_threads` row with `status='awaiting_reply'` for that phone if one doesn't already exist for that recipient in the last 14 days.

### 3. Edge function: `hook-reply-classifier`

Triggered when a new inbound SMS arrives (called from `twilio-sms-inbound` and from the existing `powerdial-sms` poll path after insert).

Logic:
1. Look up an open `hook_reply_threads` row for the inbound phone (status `awaiting_reply`).
2. If found, classify the message body:
   - Fast keyword check first for negative: `stop`, `unsubscribe`, `lose my number`, `don't text`, `do not text`, `remove me`, `quit`, `leave me alone`, `f off`, `fuck off`. Hit → mark `dnd`.
   - Otherwise call Lovable AI Gateway (`google/gemini-3-flash-preview`) with strict JSON: `{ sentiment: "positive"|"neutral"|"negative" }`.
3. If `negative`: update thread → `status='dnd'`, insert into `sms_dnd_list`.
4. If `positive`/`neutral`: update thread → `sentiment`, `status='followup_scheduled'`, `followup_send_at = inbound_at + 72h`.

### 4. Edge function: `hook-reply-followup-cron`

Runs every 15 minutes via `pg_cron` + `pg_net`. Selects threads where `status='followup_scheduled'` AND `followup_send_at <= now()` AND phone NOT in `sms_dnd_list`. Sends via existing `powerdial-sms` (`action: 'send'`) the message:

> "Hey — just checking, did you get a chance to follow us on Instagram? If not, mind giving us a follow so we can keep in touch?"

Marks `status='followup_sent'`, `followup_sent_at=now()`. Skips if a new inbound has marked the thread DND in the meantime.

Outbound send also re-checks the DND list as a safety net.

### 5. Frontend — `/sms` page tabs

Refactor `PowerDialSMSInbox` page wrapper to include three tabs:
- **Inbox** (existing component, unchanged)
- **Hook Reply** — new `HookReplyTab.tsx`
- **DND** — new `DNDListTab.tsx`

`HookReplyTab.tsx` shows `hook_reply_threads` rows with: phone, sentiment badge, status badge, original outbound preview, inbound reply preview, scheduled follow-up time (12-hr PST), action buttons (Cancel follow-up, Send now, Move to DND). Real-time subscription to the table for seamless updates (silent refresh, no flash — same pattern we just applied to the inbox).

`DNDListTab.tsx` shows `sms_dnd_list` with phone, reason, source, added date, and a "Remove from DND" action. Add manual entry input at top.

DND enforcement: extend `powerdial-sms` `send` action to refuse outbound to any number in `sms_dnd_list` (returns `{ ok: false, error: 'DND' }`). The existing Twilio auto-reply path also checks DND before sending.

### 6. Cron schedule

Insert via the schedule-jobs path:
```sql
select cron.schedule(
  'hook-reply-followup-every-15min',
  '*/15 * * * *',
  $$ select net.http_post(
    url:='https://mziuxsfxevjnmdwnrqjs.supabase.co/functions/v1/hook-reply-followup-cron',
    headers:='{"Content-Type":"application/json","apikey":"<ANON>"}'::jsonb,
    body:='{}'::jsonb
  ); $$
);
```

### 7. Files

New:
- `supabase/migrations/<ts>_hook_reply_dnd.sql` — tables + RLS
- `supabase/functions/hook-reply-classifier/index.ts`
- `supabase/functions/hook-reply-followup-cron/index.ts`
- `src/components/powerdial/HookReplyTab.tsx`
- `src/components/powerdial/DNDListTab.tsx`

Edited:
- `src/pages/SMS.tsx` (or wherever `/sms` route renders) — wrap inbox in tabs
- `supabase/functions/twilio-sms-inbound/index.ts` — call classifier after insert + DND guard on auto-reply
- `supabase/functions/powerdial-sms/index.ts` — call classifier after inbound poll insert; DND guard on outbound `send`

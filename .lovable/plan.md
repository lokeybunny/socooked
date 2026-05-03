# AI Queue — Production Operations System

A new section under **Customers → AI Queue** that turns signed/paid orders into a live, prioritized 72-hour production pipeline with cinematic UI, live countdowns, and audit-grade signing/payment tracking.

---

## 1. Database (new tables + extensions)

New table: `production_queue`
- `customer_id`, `proposal_id`, `agreement_document_id`, `invoice_id` (all nullable FKs)
- `listing_address`, `first_name`, `last_name`, `email`, `phone`
- `status` enum: `new_lead`, `proposal_sent`, `proposal_viewed`, `signed`, `payment_pending`, `payment_approved`, `in_production`, `awaiting_assets`, `editing`, `delivered`, `completed`, `overdue`
- `priority_score` (int, computed for sort)
- `production_started_at` (timestamptz, nullable — set on Start Production)
- `deadline_at` (timestamptz — `production_started_at + 72h`)
- `paused_at`, `total_paused_seconds` (for pause/resume)
- `completed_at`, `assigned_to` (uuid → profiles)
- `assets_uploaded` bool, `listing_photos_status` text
- `signed_at`, `signed_ip`, `proposal_viewed_at`, `payment_approved_at` (audit trail mirror)
- `notes` text, `meta` jsonb

Indexes on `status`, `deadline_at`, `assigned_to`. RLS: authenticated users only.

Auto-enqueue trigger: when a `proposals` row flips to `signed` AND a paid invoice exists for that customer, insert a `production_queue` row with status `payment_approved` (or `signed` if unpaid). Idempotent on `proposal_id`.

View `v_production_queue` joining customer + latest payment + agreement signed time for the UI.

## 2. Backend logic

- Edge function `production-queue-action` with actions: `start`, `pause`, `resume`, `complete`, `assign`, `add_note`, `upload_files_marker`, `send_update`.
- `start` sets `production_started_at = now()`, `deadline_at = now() + 72h`, status → `in_production`.
- Cron (every 5 min) marks rows `overdue` when `deadline_at < now()` and status not in (`completed`, `delivered`).
- Realtime: enable Supabase realtime on `production_queue` so cards update live.

## 3. Frontend

New route: `/customers/ai-queue` (sidebar item under Customers group).

Components:
- `AIQueuePage` — header metrics + filter/search bar + grid of cards.
- `QueueMetricsBar` — animated stat cards: Active, Due Soon (<12h), Overdue, Completed Today, Revenue Today, Avg Completion, Active Timers, Total In Production.
- `QueueFilters` — chips: Highest urgency, Recently signed, Payment pending, In production, Completed, Overdue, Assigned editor, Newest, Oldest + search input + sort dropdown.
- `QueueCard` — glassmorphism card with:
  - Name, email, phone, listing address
  - Audit row: "Signed May 2, 2026 — 3:42 PM" with shield/verified badge
  - Status badges (signed / paid / production)
  - `CountdownTimer` — live MM:HH ticking, color states (green >24h, yellow 12–24h, orange 4–12h, red <4h or overdue), soft pulse when red
  - Priority position indicator
  - Action buttons: Start / Pause / Resume / Complete / Send Update / Upload / Open Customer / View Agreement / View Payment / Notes / Assign
- `CountdownTimer` hook — computes remaining from `deadline_at`, accounts for paused seconds, updates every 1s.
- Framer Motion: card enter/exit, urgency pulse, metric count-up.

Sorting: client-side by remaining time ascending (overdue first, then closest deadline). Auto re-sort on tick every 30s.

## 4. Design system

Reuse existing dark theme + neon green accent (#00ff88 already in design memory). Add to `index.css`:
- `--queue-safe`, `--queue-warn`, `--queue-urgent`, `--queue-critical` HSL tokens
- `.queue-glass` utility (backdrop-blur, border-glow)
- Pulse keyframe for critical timers

All colors via tokens — no hardcoded hex in components.

## 5. Integration with existing flows

- `proposals` signed trigger already auto-emails deposit. We'll add a sibling trigger that inserts into `production_queue` when both signed + invoice paid.
- "Start Production" button on each card calls the edge function — also reachable from existing customer detail.
- Sidebar: add "AI Queue" entry under the Customers group with a Zap/Timer icon.

## 6. Out of scope (architectural placeholders only)

SMS reminders, Discord webhooks, auto-escalation cron — schema fields and edge function action stubs added; wired later.

---

**Files to create/edit (high-level):**
- migration: `production_queue` table + view + auto-enqueue trigger + RLS + realtime
- edge function: `supabase/functions/production-queue-action/index.ts`
- cron job (insert tool): mark overdue every 5 min
- pages: `src/pages/AIQueue.tsx`
- components: `src/components/queue/*` (Card, Timer, Metrics, Filters)
- routing: add route in `src/App.tsx`
- sidebar: add link in `src/components/layout/Sidebar.tsx`
- tokens: append to `src/index.css`

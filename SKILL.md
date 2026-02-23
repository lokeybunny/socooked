# clawd-command-crm

CRM integration for CLAWD Command via SpaceBot.

## Version

3.3.3

## Description

Connects SpaceBot to the CLAWD Command CRM backend, enabling lead management, deal creation, invoicing, meetings, web design generation with v0.dev's internal AI image generation, headless CMS site configs, and full CRM state retrieval via Supabase Edge Functions.

## Auth

| Type | Method |
|------|--------|
| `shared_secret` | Plain shared secret sent as HTTP header |

### Required Header

| Header | Value |
|--------|-------|
| `x-bot-secret` | `XOXOetkgmcdmFd1hAbGfQA8aDvfTQQ8U5f` |

## Base URL

```
https://mziuxsfxevjnmdwnrqjs.supabase.co/functions/v1
```

## Actions

| Name | Method | Path | Description |
|------|--------|------|-------------|
| `get_state` | GET | `/clawd-bot/state` | Get CRM snapshot |
| `create_or_update_lead` | POST | `/clawd-bot/lead` | Create or update lead |
| `create_or_update_customer` | POST | `/clawd-bot/customer` | Create or update customer (include `id` to update) |
| `delete_customer` | DELETE | `/clawd-bot/customer` | Delete customer by `id` in body `{"id":"uuid"}` |
| `create_deal` | POST | `/clawd-bot/deal` | Create deal |
| `create_invoice` | POST | `/invoice-api` | Create invoice |
| `create_meeting` | POST | `/clawd-bot/meeting` | Create a meeting room |
| `create_card` | POST | `/clawd-bot/card` | Create a board card |
| `book_meeting` | POST | `/clawd-bot/book-meeting` | Book a calendar meeting (with email + Telegram notifications) |
| `cancel_booking` | POST | `/clawd-bot/book-meeting` | Cancel a booking `{ action: "cancel", booking_id }` |
| `reschedule_booking` | POST | `/clawd-bot/book-meeting` | Reschedule `{ action: "reschedule", booking_id, new_date, new_time }` |
| `smart_book` | POST | `/clawd-bot/smart-book` | **Intelligent booking: resolves customer, finds next available slot, auto-books with notifications** |
| `list_bookings` | GET | `/clawd-bot/bookings` | List bookings (filter: `?status=confirmed&guest_email=...`) |
| `get_availability` | GET | `/clawd-bot/availability` | Get available time slots |
| `generate_website` | POST | `/v0-designer` | **Generate v0 website — returns edit_url instantly** |
| `poll_status` | POST | `/v0-poll` | **Poll completion status of generating previews** |
| `edit_site_content` | POST | `/clawd-bot/site-config` | Edit site content via Headless CMS |
| `structural_edit` | POST | `/v0-designer` | Structural v0 edit (requires `chat_id` in body) |
| `get_site_configs` | GET | `/clawd-bot/site-configs?site_id=slug` | Read site content (PUBLIC) |
| `upsert_site_config` | POST | `/clawd-bot/site-config` | Create/update a site content section |
| `delete_site_config` | DELETE | `/clawd-bot/site-config` | Delete a site content section |
| `list_previews` | GET | `/clawd-bot/previews` | List API-generated work |

---

## 🚨 ARCHITECTURE: API FIRST → LINK → CRM (v3.3.3)

### The v0-designer function is a DIRECT v0 API PROXY

The `/v0-designer` edge function:
1. **Calls v0.dev API directly** → gets `chat_id` and `edit_url` in < 1 second
2. **Returns the link to the caller IMMEDIATELY**
3. **Then** stores records in the CRM (customer, thread, preview, activity) in parallel

**The caller (Cortex/SpaceBot) gets the link FIRST, reports it to the user, and CRM storage is handled automatically by the function.**

### ⛔ NEVER use v0-designer for status checks

**WRONG:** `POST /v0-designer { "prompt": "Check status of chat abc123" }` ← This creates a NEW v0 chat!
**RIGHT:** `POST /v0-poll` or `GET /clawd-bot/previews` ← This checks existing chats

---

## v0 Internal Image Generation Strategy (v3.3.3)

### WHY this approach

v0.dev has built-in AI image generation capabilities. When the prompt uses **design-intent language** (describing visuals as part of the design, not as "generate image X" instructions), v0 will use its own internal AI to create original images directly within the rendered preview.

The key is **prompt crafting**: describe each section's visual as a creative direction ("a full-width hero with a cinematic barbershop interior, warm Edison bulb lighting, leather chairs") rather than a technical instruction ("generate an image of a barbershop").

### How the CRM Gateway Enforces This

The `/v0-designer` edge function automatically:

1. **Auto-enriches** weak prompts by appending a design-direction block that instructs v0 to use its internal AI image generation for every visual section
2. **Appends Tailwind CDN constraint** — forces `<script src="https://cdn.tailwindcss.com">` instead of `import "tailwindcss"`

### Strict Rules

1. **No fabricated `preview_url`** — every URL must come from a real v0 API response
2. **No `placeholder.svg`** — rejected at the gateway level
3. **No `unsplash.com` / `pexels.com` / stock-photo language** — rejected at the gateway level
4. **No `import "tailwindcss"`** — Tailwind CDN only
5. **Design-intent language only** — describe visuals as creative direction, not as "generate" commands
6. **Every prompt MUST end with:** `Replace all image placeholders with real people smiling within this niche.`

### Agent Prompt Crafting Rules

When Cortex writes a prompt for `/v0-designer`:

**✅ DO — Use design-intent language:**
- "The hero features a dramatic wide-angle view of the barbershop interior with warm Edison bulb lighting and exposed brick"
- "Each service card displays a unique professional scene — precise fade haircut, hot towel shave, beard sculpting"

**❌ DON'T — Use generation commands:**
- "Generate an image of a barbershop" ← v0 treats this as text, not visual generation
- "Create a photo of..." ← same problem
- "Use this image URL: https://..." ← no external URLs
- "placeholder.svg" ← rejected by gateway

---

## Web Design Workflow (v3.3.3) — API FIRST

### 🚀 New Site Generation Flow

```
User says "build website" → Cortex calls POST /v0-designer → Gets edit_url in < 1s → Reports link to user IMMEDIATELY → CRM storage happens automatically → v0-poll handles completion detection
```

### Step-by-Step for Cortex/SpaceBot:

1. **Call** `POST /v0-designer` with `{ prompt, customer_id, category }`
2. **Read** `response.data.data.edit_url` and `response.data.data.chat_id`
3. **Send link to user IMMEDIATELY** (within 3 seconds):

```
✅ Website started for [Name]!

🔴 Watch live: https://v0.app/chat/[CHAT_ID]

⏱️ Status: generating
💬 Chat ID: [CHAT_ID]

The AI is generating your site in real-time.

I'll message you when the final preview URL is ready!
```

4. **Auto-poll** `POST /v0-poll` or `GET /clawd-bot/previews` every 30 seconds
5. **Notify user** when `preview_url` is ready

### ❌ BANNED Output Patterns (zero tolerance)

- `⏳ Creating [Name]...` — FORBIDDEN
- `Step 1: Creating customer record...` — FORBIDDEN
- `Step 2: Generating site...` — FORBIDDEN
- Any multi-step progress narration — FORBIDDEN
- Waiting to give link until "done" — FORBIDDEN

### ⛔ CRITICAL: Status Check Protocol

| Need | Method | Endpoint |
|------|--------|----------|
| Check if preview is ready | POST | `/v0-poll` |
| List all previews | GET | `/clawd-bot/previews` |
| Check specific chat | POST | `/v0-poll?chat_id=xxx` |

**NEVER use `POST /v0-designer` for status checks.** That creates a NEW v0 chat and wastes API credits.

---

## 🔄 MANDATORY AUTO-POLLING PROTOCOL

### The user must NEVER have to ask "update?" or "status?"

After delivering the initial link, the agent MUST automatically poll for completion.

### Polling Rules

| Rule | Value |
|------|-------|
| Poll interval | Every 30 seconds |
| Endpoint | `POST /v0-poll` (preferred) or `GET /clawd-bot/previews` |
| Start | Immediately after initial link delivery |
| Stop | When `preview_url` exists OR 10-minute timeout |
| User prompt required | **NEVER** — polling is automatic |

### Message Sequence

```
0:00   "✅ Started! Watch LIVE: [link]. Checking every 30s..."
0:30   (silent check — no message)
1:00   (silent check — no message)
2:00   "⏳ 2:00 elapsed... Still generating..."
2:30   (silent check)
4:00   "⏳ 4:00 elapsed... Still generating..."
...
Done   "✅ READY! Your site is live: [preview_url]"
10:00  "⏱️ 10 minutes passed. Generation may have timed out."
```

### Polling Failure Modes

| Scenario | Result |
|----------|--------|
| User has to ask "update?" | **YOU FAILED** |
| User waits >2 min with no status | **YOU FAILED** |
| Polling stops before completion | **YOU FAILED** |
| Status check sent to /v0-designer | **YOU FAILED** |

---

### Structural Edits
1. `GET /clawd-bot/previews` → find `chat_id`
2. `POST /v0-designer` with `{ chat_id, prompt }`

### Content Edits (Headless CMS)
1. `GET /clawd-bot/previews` → find `site_id`
2. `POST /clawd-bot/site-config` → update content sections

### Site Config Sections
`hero`, `about`, `services`, `gallery`, `contact`, `footer`, `meta`

### site_id Format
Kebab-case: `terrion-barber`, `jane-photography`, `atlanta-fitness`

## Meeting + Card Workflow

1. `POST /clawd-bot/meeting` with `{"title": "Meeting: Customer Name"}`
2. `POST /clawd-bot/card` with `{ board_id, list_id, title, customer_id, source_url: room_url }`

## Smart Booking (Bot Autopilot)

For natural-language booking requests like _"book a meeting with John Smith whenever I'm next available"_:

```
POST /clawd-bot/smart-book
{
  "guest_name": "John Smith",
  "guest_email": "john@example.com",       // optional — resolves or creates customer
  "guest_phone": "+1234567890",             // optional
  "duration_minutes": 30,                   // optional, default 30
  "preferred_date": "2026-02-25",           // optional — starts search from here
  "preferred_time": "10:00",                // optional — tries this time first
  "notes": "Video zoom meeting"             // optional
}
```

**What it does automatically:**
1. **Resolves customer** — searches by email or name, creates lead if not found
2. **Reads availability_slots** — your configured working hours
3. **Finds next open slot** — checks against existing bookings for conflicts
4. **Books the meeting** — creates meeting room, booking, calendar event
5. **Sends notifications** — Telegram alert + Gmail confirmation to guest
6. **Links customer** — attaches customer_id to the meeting record

**Response:**
```json
{
  "action": "smart_booked",
  "customer_id": "uuid",
  "booking": { "id": "uuid", "booking_date": "2026-02-25", ... },
  "room_url": "https://stu25.com/meet/abc123",
  "manage_url": "https://stu25.com/manage-booking/uuid",
  "scheduled": {
    "date": "2026-02-25",
    "date_formatted": "Wednesday, February 25, 2026",
    "time": "10:00",
    "time_formatted": "10:00 AM (PST)",
    "duration": 30
  },
  "message": "✅ Meeting booked with John Smith on Wednesday, February 25, 2026 at 10:00 AM PST (30 min)."
}
```

## Customer Lookup & Safe Create/Update

1. `GET /clawd-bot/customers` (search by name/email)
2. If found → `POST /clawd-bot/customer` with `{"id": "uuid", ...updates}`
3. If not found → `POST /clawd-bot/lead` to create new

## ⛔ ABSOLUTE PROHIBITIONS

1. **NEVER simulate or fabricate API responses.**
2. **NEVER use stock photos or placeholder images.** Use design-intent language so v0 generates images internally.
3. **NEVER use `import "tailwindcss"`.** Tailwind CDN only.
4. **NEVER show multi-step progress ("Step 1", "Step 2") to the user.** Single call, instant link.
5. **NEVER delay delivering the `edit_url`.** Return it the moment the API responds.
6. **NEVER use `POST /v0-designer` for status checks.** Use `POST /v0-poll` instead.
7. **NEVER send "Check status of chat X" as a prompt to v0-designer.** This creates junk chats.

## Install

```
lokeybunny/clawd-command-crm-skill
```

# clawd-command-crm

CRM integration for CLAWD Command via SpaceBot.

## Version

3.3.2

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
| `generate_website` | POST | `/v0-designer` | **Generate v0 website (uses v0's internal AI image gen)** |
| `edit_site_content` | POST | `/clawd-bot/site-config` | Edit site content via Headless CMS |
| `structural_edit` | POST | `/v0-designer` | Structural v0 edit (requires `chat_id` in body) |
| `get_site_configs` | GET | `/clawd-bot/site-configs?site_id=slug` | Read site content (PUBLIC) |
| `upsert_site_config` | POST | `/clawd-bot/site-config` | Create/update a site content section |
| `delete_site_config` | DELETE | `/clawd-bot/site-config` | Delete a site content section |
| `list_previews` | GET | `/clawd-bot/previews` | List API-generated work |

---

## v0 Internal Image Generation Strategy (v3.3.2)

### WHY this approach

v0.dev has built-in AI image generation capabilities. When the prompt uses **design-intent language** (describing visuals as part of the design, not as "generate image X" instructions), v0 will use its own internal AI to create original images directly within the rendered preview.

The key is **prompt crafting**: describe each section's visual as a creative direction ("a full-width hero with a cinematic barbershop interior, warm Edison bulb lighting, leather chairs") rather than a technical instruction ("generate an image of a barbershop").

### How the CRM Gateway Enforces This

The `/v0-designer` edge function automatically:

1. **Validates** that prompts contain visual descriptions (rejects prompts with no imagery language)
2. **Rejects** any prompt containing `placeholder.svg`, `unsplash.com`, `pexels.com`, or stock-photo references (HTTP 400)
3. **Auto-enriches** weak prompts by appending a design-direction block that instructs v0 to use its internal AI image generation for every visual section
4. **Appends Tailwind CDN constraint** — forces `<script src="https://cdn.tailwindcss.com">` instead of `import "tailwindcss"`

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
- "The about section shows a confident team portrait in the shop with warm, inviting lighting"
- "Gallery showcases 6 distinct portfolio shots: before/after cuts, styled looks, shop atmosphere"

**❌ DON'T — Use generation commands:**
- "Generate an image of a barbershop" ← v0 treats this as text, not visual generation
- "Create a photo of..." ← same problem
- "Use this image URL: https://..." ← no external URLs
- "placeholder.svg" ← rejected by gateway

### Example: Correct v0-designer Request

```json
POST /v0-designer
{
  "prompt": "Build a premium barbershop website for 'Elite Cuts' in Atlanta. Dark charcoal and gold color scheme.\n\nHero: Full-width cinematic scene of a luxury barbershop interior — leather barber chairs, warm Edison bulb lighting, exposed brick walls, vintage mirrors. Bold headline 'Elite Cuts' with a 'Book Now' CTA.\n\nServices (3 cards): Each with its own distinct professional scene:\n1. 'Precision Fade' — close-up of a barber performing a crisp taper fade, shallow depth of field\n2. 'Hot Towel Shave' — steam rising from a hot towel on a client's face, warm amber tones\n3. 'Beard Sculpting' — detailed beard trim in progress, professional lighting\n\nAbout: Team portrait of 3 barbers standing confidently in the shop, arms crossed, warm overhead lighting, professional but approachable.\n\nGallery: 6 portfolio images with varied compositions — before/after haircuts, styled pompadours, classic cuts from different angles, shop atmosphere shots.\n\nContact: Map embed placeholder, hours, phone, address. Dark footer with gold accents.\n\nReplace all image placeholders with real people smiling within this niche.",
  "customer_id": "abc-123",
  "category": "brick-and-mortar"
}
```

### Fallback Behavior

If v0 renders without images despite design-intent prompts:
- Use a structural edit (`POST /v0-designer` with `chat_id`) to reinforce: "Replace any missing images with your AI-generated visuals matching the original design direction"
- NEVER insert fabricated image URLs
- NEVER claim images exist if the preview shows none

---

## Web Design Workflow (v3.3.2)

### New Site Generation — INSTANT LINK DELIVERY
1. `POST /v0-designer` with `{ prompt, customer_id, category }` — **SINGLE CALL**
2. Return `edit_url` to user **IMMEDIATELY** (within 3 seconds of API response)
3. Poll silently in background for `preview_url`
4. Notify user again ONLY when `preview_url` is ready

### ✅ REQUIRED Output Format (copy exactly)

```
✅ Website started for [Name]!

🔴 Watch live: https://v0.app/chat/[CHAT_ID]

I'll notify you when the final URL is ready.
```

### ❌ BANNED Output Patterns (zero tolerance)

- `⏳ Creating [Name]...` — FORBIDDEN
- `Step 1: Creating customer record...` — FORBIDDEN
- `Step 2: Generating site...` — FORBIDDEN
- `Worker is still executing...` — FORBIDDEN
- `Waiting for the API...` — FORBIDDEN
- Any multi-step progress narration — FORBIDDEN
- Any aesthetic descriptions before link — FORBIDDEN
- Waiting to give link until "done" — FORBIDDEN

### Correct Flow

```
User request → POST /v0-designer → Instant edit_url → (silent background poll) → notify with preview_url
```

### Wrong Flow (FORBIDDEN)

```
User request → "Creating customer..." → "Step 1..." → "Step 2..." → Link
```

**The API responds in < 1 second. Do NOT add artificial delays or narration.**

### Response Data Mapping
- `edit_url` → from `response.data.data.edit_url` — give IMMEDIATELY
- `preview_url` → from polling — give when ready
- `chat_id` → from `response.data.data.chat_id` — include in live link

### Content Edits (Headless CMS)
1. `GET /clawd-bot/previews` → find `site_id`
2. `POST /clawd-bot/site-config` → update content sections
3. Site reflects changes on next load

### Structural Edits
1. `GET /clawd-bot/previews` → find `chat_id`
2. `POST /v0-designer` with `{ chat_id, prompt }`

### Site Config Sections
`hero`, `about`, `services`, `gallery`, `contact`, `footer`, `meta`

### site_id Format
Kebab-case: `terrion-barber`, `jane-photography`, `atlanta-fitness`

## Meeting + Card Workflow

1. `POST /clawd-bot/meeting` with `{"title": "Meeting: Customer Name"}`
2. `POST /clawd-bot/card` with `{ board_id, list_id, title, customer_id, source_url: room_url }`

## Customer Lookup & Safe Create/Update

1. `GET /clawd-bot/customers` (search by name/email)
2. If found → `POST /clawd-bot/customer` with `{"id": "uuid", ...updates}`
3. If not found → `POST /clawd-bot/lead` to create new

## ⛔ ABSOLUTE PROHIBITIONS

1. **NEVER simulate or fabricate API responses.**
2. **NEVER use stock photos or placeholder images.** Use design-intent language so v0 generates images internally.
3. **NEVER claim images were generated unless the preview actually shows them.**
4. **NEVER use `import "tailwindcss"`.** Tailwind CDN only.
5. **NEVER use "generate an image of..." language** — use design-intent descriptions instead.
6. **NEVER show multi-step progress ("Step 1", "Step 2") to the user.** Single call, instant link.
7. **NEVER delay delivering the `edit_url`.** Return it the moment the API responds.

## Install

```
lokeybunny/clawd-command-crm-skill
```

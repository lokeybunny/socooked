# clawd-command-crm

CRM integration for CLAWD Command via SpaceBot.

## Version

3.1.0

## Description

Connects SpaceBot to the CLAWD Command CRM backend, enabling lead management, deal creation, invoicing, meetings, web design generation, headless CMS site configs, and full CRM state retrieval via Supabase Edge Functions.

## Auth

| Type | Method |
|------|--------|
| `shared_secret` | Plain shared secret sent as HTTP header |

### How it works

Send the shared secret as the `x-bot-secret` header on **every** request. No HMAC signing, no timestamps, no nonces — just the raw secret value.

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
| `create_meeting` | POST | `/clawd-bot/meeting` | Create a meeting room (returns `room_code` + `room_url`) |
| `create_card` | POST | `/clawd-bot/card` | Create a board card |
| `generate_website` | POST | `/clawd-bot/generate-website` | Generate a new v0 website |
| `edit_website` | POST | `/clawd-bot/edit-website` | Edit existing v0 website (requires `chat_id`) |
| `publish_website` | POST | `/clawd-bot/publish-website` | Deploy v0 site to Vercel (requires Vercel linking) |
| `get_site_configs` | GET | `/clawd-bot/site-configs?site_id=slug` | Read site content (PUBLIC — no auth needed) |
| `upsert_site_config` | POST | `/clawd-bot/site-config` | Create/update a site content section |
| `delete_site_config` | DELETE | `/clawd-bot/site-config` | Delete a site content section |
| `list_previews` | GET | `/clawd-bot/previews` | List API-generated work |

## Web Design Workflow

### Option A: v0 API (initial generation only)
1. `POST /clawd-bot/generate-website` → creates a new v0 site
2. `POST /clawd-bot/edit-website` → sends edits to existing chat (requires `chat_id`)

### Option B: Site Configs (preferred for ongoing edits)
1. Generate site once with v0 (include config-fetching hook in prompt)
2. Use `POST /clawd-bot/site-config` to update content sections
3. Site auto-reflects changes on next page load — no deploy needed

### Site Config Sections
`hero`, `about`, `services`, `gallery`, `contact`, `footer`, `meta`

### site_id Format
Kebab-case: `terrion-barber`, `jane-photography`, `atlanta-fitness`

## Meeting + Card Workflow

When scheduling a meeting, Cortex should chain **two** API calls:

1. **Create the meeting room** → `POST /clawd-bot/meeting` with `{"title": "Meeting: Customer Name"}`
   - Response includes `room_code` and `room_url` (e.g. `/meet/abc123`)
2. **Create a board card** → `POST /clawd-bot/card` with:
   ```json
   {
     "board_id": "561c6b68-e7bb-49c0-9c94-2182780d2030",
     "list_id": "500589c6-bcb9-4949-8240-6630a47db30b",
     "title": "Meeting: Customer Name",
     "customer_id": "<customer_uuid>",
     "source_url": "<room_url from step 1>"
   }
   ```

## Customer Lookup & Safe Create/Update

1. **Lookup**: `GET /clawd-bot/customers` (filter with `?status=lead` or search by name/email)
2. **If found** → `POST /clawd-bot/customer` with `{"id": "uuid", ...updates}`
3. **If not found** → `POST /clawd-bot/lead` to create new
4. Respect rate limits (5 req/s). Pause 10–15s if throttled.
5. Never execute writes without valid `x-bot-secret`.

## Manifest

See [`skill.json`](./skill.json) for the machine-readable skill definition.

## Install

```
lokeybunny/clawd-command-crm-skill
```

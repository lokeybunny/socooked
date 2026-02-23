# CLAWD Command CRM — Agent API Reference v3.0

> **Paste this entire document into your agent's system prompt or knowledge base.**
> It is the single source of truth for all CRM API calls.

---

## ⚠️ CRITICAL RULES

1. **Project ID**: `mziuxsfxevjnmdwnrqjs` — do NOT use any other project ID.
2. **Base URL**: `https://mziuxsfxevjnmdwnrqjs.supabase.co/functions/v1`
3. **No path params** — IDs are ALWAYS sent in the JSON body, never in the URL.
4. **No trailing segments** — e.g. `/clawd-bot/customers` is correct, `/clawd-bot/customers/list` is WRONG.
5. **Upsert pattern** — POST with `id` in body = update. POST without `id` = create.
6. **Filters** — use query params: `?status=lead&category=digital-services`
7. **Categories** — MUST be one of: `digital-services`, `brick-and-mortar`, `digital-ecommerce`, `food-and-beverage`, `mobile-services`, `other`. Invalid values are auto-mapped to `other`.

---

## Authentication

Every request must include:

```
x-bot-secret: XOXOetkgmcdmFd1hAbGfQA8aDvfTQQ8U5f
Content-Type: application/json
```

---

## Response Format

All responses follow:

```json
{ "success": true, "data": { ... }, "api_version": "v1" }
{ "success": false, "error": "message", "api_version": "v1" }
```

---

## Complete Endpoints Reference

### State (full snapshot)

| Action | Method | URL |
|--------|--------|-----|
| Get all | GET | `/clawd-bot/state` |

> Returns: `boards`, `customers`, `deals`, `projects`, `meetings`, `templates`, `content`, `transcriptions`, `bot_tasks`

---

### Customers

| Action | Method | URL | Body |
|--------|--------|-----|------|
| List | GET | `/clawd-bot/customers` | — |
| List filtered | GET | `/clawd-bot/customers?status=lead&category=digital-services` | — |
| Create | POST | `/clawd-bot/customer` | `{ "full_name": "..." }` |
| Update | POST | `/clawd-bot/customer` | `{ "id": "uuid", "full_name": "New Name" }` |
| Delete | DELETE | `/clawd-bot/customer` | `{ "id": "uuid" }` |
| Bulk Delete | POST | `/clawd-bot/bulk-delete` | `{ "ids": ["uuid1", "uuid2", ...] }` |
| Search | GET | `/clawd-bot/search?q=term` | — |

### Leads (shortcut — creates customer with status=lead)

| Action | Method | URL | Body |
|--------|--------|-----|------|
| Create/Update | POST | `/clawd-bot/lead` | `{ "full_name": "...", "email": "...", "source": "..." }` |

### Deals

| Action | Method | URL | Body |
|--------|--------|-----|------|
| List | GET | `/clawd-bot/deals` | — |
| Create | POST | `/clawd-bot/deal` | `{ "title": "...", "customer_id": "uuid" }` |
| Update | POST | `/clawd-bot/deal` | `{ "id": "uuid", "stage": "negotiation" }` |
| Delete | DELETE | `/clawd-bot/deal` | `{ "id": "uuid" }` |

### Projects

| Action | Method | URL | Body |
|--------|--------|-----|------|
| List | GET | `/clawd-bot/projects` | — |
| Create | POST | `/clawd-bot/project` | `{ "title": "..." }` |
| Update | POST | `/clawd-bot/project` | `{ "id": "uuid", "status": "active" }` |
| Delete | DELETE | `/clawd-bot/project` | `{ "id": "uuid" }` |

### Project Tasks

| Action | Method | URL | Body |
|--------|--------|-----|------|
| List | GET | `/clawd-bot/project-tasks?project_id=uuid` | — |
| Create | POST | `/clawd-bot/project-task` | `{ "title": "...", "project_id": "uuid" }` |
| Update | POST | `/clawd-bot/project-task` | `{ "id": "uuid", "status": "done" }` |
| Delete | DELETE | `/clawd-bot/project-task` | `{ "id": "uuid" }` |

### Invoices (via clawd-bot)

| Action | Method | URL | Body |
|--------|--------|-----|------|
| List | GET | `/clawd-bot/invoices?customer_id=uuid` | — |
| Create | POST | `/clawd-bot/invoice` | `{ "customer_id": "uuid", ... }` |
| Update | POST | `/clawd-bot/invoice` | `{ "id": "uuid", "status": "paid" }` |
| Delete | DELETE | `/clawd-bot/invoice` | `{ "id": "uuid" }` |

### Invoices (via invoice-api — with line items + auto-calc)

| Action | Method | URL | Body |
|--------|--------|-----|------|
| Create | POST | `/invoice-api` | `{ "customer_id": "uuid", "line_items": [...] }` |
| List | GET | `/invoice-api?customer_id=uuid` | — |
| Update status | PATCH | `/invoice-api?id=uuid` | `{ "status": "paid" }` |

### Boards

| Action | Method | URL | Body |
|--------|--------|-----|------|
| List (with lists+cards) | GET | `/clawd-bot/boards` | — |
| Create | POST | `/clawd-bot/board` | `{ "name": "..." }` |
| Update | POST | `/clawd-bot/board` | `{ "id": "uuid", "name": "New" }` |
| Delete | DELETE | `/clawd-bot/board` | `{ "id": "uuid" }` |

### Lists

| Action | Method | URL | Body |
|--------|--------|-----|------|
| Create | POST | `/clawd-bot/list` | `{ "board_id": "uuid", "name": "..." }` |
| Update | POST | `/clawd-bot/list` | `{ "id": "uuid", "name": "..." }` |
| Delete | DELETE | `/clawd-bot/list` | `{ "id": "uuid" }` |

### Cards

| Action | Method | URL | Body |
|--------|--------|-----|------|
| Create | POST | `/clawd-bot/card` | `{ "board_id": "uuid", "list_id": "uuid", "title": "..." }` |
| Update | POST | `/clawd-bot/card` | `{ "id": "uuid", "title": "Updated" }` |
| Delete | DELETE | `/clawd-bot/card` | `{ "id": "uuid" }` |
| Move | POST | `/clawd-bot/move` | `{ "card_id": "uuid", "to_list_id": "target_uuid" }` |

### Comments

| Action | Method | URL | Body |
|--------|--------|-----|------|
| List | GET | `/clawd-bot/comments?card_id=uuid` | — |
| Create | POST | `/clawd-bot/comment` | `{ "card_id": "uuid", "comment": "..." }` |
| Delete | DELETE | `/clawd-bot/comment` | `{ "id": "uuid" }` |

### Attachments

| Action | Method | URL | Body |
|--------|--------|-----|------|
| List | GET | `/clawd-bot/attachments?card_id=uuid` | — |
| Create | POST | `/clawd-bot/attach` | `{ "card_id": "uuid", "url": "...", "type": "link" }` |
| Delete | DELETE | `/clawd-bot/attach` | `{ "id": "uuid" }` |

### Labels

| Action | Method | URL | Body |
|--------|--------|-----|------|
| List | GET | `/clawd-bot/labels?board_id=uuid` | — |
| Create | POST | `/clawd-bot/label` | `{ "board_id": "uuid", "name": "urgent", "color": "red" }` |
| Delete | DELETE | `/clawd-bot/label` | `{ "id": "uuid" }` |

### Card Labels (assign/remove)

| Action | Method | URL | Body |
|--------|--------|-----|------|
| Assign | POST | `/clawd-bot/card-label` | `{ "card_id": "uuid", "label_id": "uuid" }` |
| Remove | DELETE | `/clawd-bot/card-label` | `{ "card_id": "uuid", "label_id": "uuid" }` |

### Checklists

| Action | Method | URL | Body |
|--------|--------|-----|------|
| List | GET | `/clawd-bot/checklists?card_id=uuid` | — |
| Create | POST | `/clawd-bot/checklist` | `{ "card_id": "uuid", "title": "..." }` |
| Update | POST | `/clawd-bot/checklist` | `{ "id": "uuid", "title": "..." }` |
| Delete | DELETE | `/clawd-bot/checklist` | `{ "id": "uuid" }` |

### Checklist Items

| Action | Method | URL | Body |
|--------|--------|-----|------|
| Create | POST | `/clawd-bot/checklist-item` | `{ "checklist_id": "uuid", "content": "..." }` |
| Update (toggle done) | POST | `/clawd-bot/checklist-item` | `{ "id": "uuid", "is_done": true }` |
| Delete | DELETE | `/clawd-bot/checklist-item` | `{ "id": "uuid" }` |

### Content Assets

| Action | Method | URL | Body |
|--------|--------|-----|------|
| List | GET | `/clawd-bot/content` | — |
| List filtered | GET | `/clawd-bot/content?customer_id=uuid&source=instagram&type=image&category=digital-services` | — |
| Create | POST | `/clawd-bot/content` | `{ "title": "...", "type": "post", "source": "instagram", "customer_id": "uuid" }` |
| Update | POST | `/clawd-bot/content` | `{ "id": "uuid", "status": "published" }` |
| Delete | DELETE | `/clawd-bot/content` | `{ "id": "uuid" }` |

> **Content types**: `article`, `image`, `video`, `landing_page`, `doc`, `post`
> **Source values**: `dashboard`, `google-drive`, `instagram`, `sms`, `client-direct`, `other`

### Templates

| Action | Method | URL | Body |
|--------|--------|-----|------|
| List | GET | `/clawd-bot/templates?type=contract&category=digital-services` | — |
| Create | POST | `/clawd-bot/template` | `{ "name": "...", "type": "contract", "body_html": "<h1>...</h1>", "placeholders": ["{{client_name}}"] }` |
| Update | POST | `/clawd-bot/template` | `{ "id": "uuid", "body_html": "..." }` |
| Delete | DELETE | `/clawd-bot/template` | `{ "id": "uuid" }` |

> **Template types**: `contract`, `proposal`, `invoice`, `email`
> **Supported placeholders**: `{{client_name}}`, `{{company_name}}`, `{{company_address}}`, `{{client_email}}`, `{{date}}`

### Threads (Conversations)

| Action | Method | URL | Body |
|--------|--------|-----|------|
| List | GET | `/clawd-bot/threads?customer_id=uuid` | — |
| Create | POST | `/clawd-bot/thread` | `{ "customer_id": "uuid", "channel": "chat" }` |
| Update | POST | `/clawd-bot/thread` | `{ "id": "uuid", "status": "closed" }` |
| Delete | DELETE | `/clawd-bot/thread` | `{ "id": "uuid" }` |

### Documents

| Action | Method | URL | Body |
|--------|--------|-----|------|
| List | GET | `/clawd-bot/documents?customer_id=uuid` | — |
| Create | POST | `/clawd-bot/document` | `{ "customer_id": "uuid", "title": "...", "type": "contract" }` |
| Update | POST | `/clawd-bot/document` | `{ "id": "uuid", "status": "final" }` |
| Delete | DELETE | `/clawd-bot/document` | `{ "id": "uuid" }` |

### Communications

| Action | Method | URL | Body |
|--------|--------|-----|------|
| List | GET | `/clawd-bot/communications?customer_id=uuid&type=email` | — |
| Create | POST | `/clawd-bot/communication` | `{ "type": "email", "customer_id": "uuid", ... }` |
| Update | POST | `/clawd-bot/communication` | `{ "id": "uuid", "status": "read" }` |
| Delete | DELETE | `/clawd-bot/communication` | `{ "id": "uuid" }` |

### Interactions

| Action | Method | URL | Body |
|--------|--------|-----|------|
| List | GET | `/clawd-bot/interactions?customer_id=uuid` | — |
| Create | POST | `/clawd-bot/interaction` | `{ "customer_id": "uuid", "type": "call" }` |
| Update | POST | `/clawd-bot/interaction` | `{ "id": "uuid", "outcome": "interested" }` |
| Delete | DELETE | `/clawd-bot/interaction` | `{ "id": "uuid" }` |

### Signatures (read-only)

| Action | Method | URL |
|--------|--------|-----|
| List | GET | `/clawd-bot/signatures?customer_id=uuid` |

### Transcriptions

| Action | Method | URL | Body |
|--------|--------|-----|------|
| List | GET | `/clawd-bot/transcriptions?customer_id=uuid&source_type=recording` | — |
| Create | POST | `/clawd-bot/transcription` | `{ "source_id": "...", "source_type": "recording", "transcript": "..." }` |
| Update | POST | `/clawd-bot/transcription` | `{ "id": "uuid", "summary": "..." }` |
| Delete | DELETE | `/clawd-bot/transcription` | `{ "id": "uuid" }` |

### Bot Tasks

| Action | Method | URL | Body |
|--------|--------|-----|------|
| List | GET | `/clawd-bot/bot-tasks?status=queued` | — |
| Create | POST | `/clawd-bot/bot-task` | `{ "title": "...", "bot_agent": "cortex" }` |
| Update | POST | `/clawd-bot/bot-task` | `{ "id": "uuid", "status": "done" }` |
| Delete | DELETE | `/clawd-bot/bot-task` | `{ "id": "uuid" }` |

### Email (Gmail — warren@stu25.com)

| Action | Method | URL | Body |
|--------|--------|-----|------|
| Inbox | GET | `/clawd-bot/email?action=inbox` | — |
| Sent | GET | `/clawd-bot/email?action=sent` | — |
| Drafts | GET | `/clawd-bot/email?action=drafts` | — |
| Read message | GET | `/clawd-bot/email?action=message&id=MSG_ID` | — |
| Send | POST | `/clawd-bot/email` | `{ "to": "jane@example.com", "subject": "Hello", "body": "<p>Hi!</p>" }` |
| Save draft | POST | `/clawd-bot/email` | `{ "action": "save-draft", "to": "...", "subject": "...", "body": "..." }` |

> Sends from `warren@stu25.com` via Google Workspace service account. Body supports HTML.

### Meetings

| Action | Method | URL | Body |
|--------|--------|-----|------|
| List | GET | `/clawd-bot/meetings?status=waiting` | — |
| Create | POST | `/clawd-bot/meeting` | `{ "title": "Kickoff" }` |
| Update | POST | `/clawd-bot/meeting` | `{ "id": "uuid", "status": "active" }` |
| Delete | DELETE | `/clawd-bot/meeting` | `{ "id": "uuid" }` |

### Automations

| Action | Method | URL | Body |
|--------|--------|-----|------|
| List | GET | `/clawd-bot/automations?enabled=true` | — |
| Create | POST | `/clawd-bot/automation` | `{ "name": "...", "trigger_table": "customers", "trigger_event": "insert", ... }` |
| Update | POST | `/clawd-bot/automation` | `{ "id": "uuid", "is_enabled": false }` |
| Delete | DELETE | `/clawd-bot/automation` | `{ "id": "uuid" }` |
| Trigger | POST | `/clawd-bot/trigger` | `{ "event": "INSERT", "table": "customers", "payload": {...} }` |

### Activity Log (read-only)

| Action | Method | URL |
|--------|--------|-----|
| List | GET | `/clawd-bot/activity?entity_type=customers` |

### Upload Tokens (Custom-U Portal)

| Action | Method | URL | Body |
|--------|--------|-----|------|
| Generate | POST | `/clawd-bot/upload-token` | `{ "customer_id": "uuid" }` |
| Revoke | DELETE | `/clawd-bot/upload-token` | `{ "customer_id": "uuid" }` |

> Generate returns `{ "upload_token": "...", "portal_url": "https://stu25.com/u/TOKEN" }`

### Email Generation

| Action | Method | URL | Body |
|--------|--------|-----|------|
| Generate portal invite | POST | `/clawd-bot/generate-email` | `{ "customer_name": "...", "portal_link": "..." }` |
| Generate resume | POST | `/clawd-bot/generate-resume` | `{ "name": "...", "email": "..." }` |
| Generate contract | POST | `/clawd-bot/generate-contract` | `{ "client_name": "...", "terms": {...} }` |
| Analyze thread | POST | `/clawd-bot/analyze-thread` | `{ "transcript": "..." }` |

### Web Design (v0 Designer) — DIRECT CALL

> ⚠️ **NEW WORKFLOW (v3.2):** For **new site generation**, SpaceBot calls the `/v0-designer` endpoint **directly** — do NOT proxy through `/clawd-bot/generate-website`. The v0-designer function handles all CRM record-keeping (bot_tasks, api_previews, threads, activity_log) automatically.
> For **editing existing sites**, use the Headless CMS pattern via Site Configs (below). The v0 API does not support reliable edits.

| Action | Method | URL | Body |
|--------|--------|-----|------|
| **Generate website (DIRECT)** | POST | `/v0-designer` | `{ "prompt": "...", "customer_id": "uuid", "category": "..." }` |
| Generate website (legacy proxy) | POST | `/clawd-bot/generate-website` | `{ "prompt": "...", "customer_id": "uuid" }` |
| Publish website | POST | `/clawd-bot/publish-website` | `{ "chat_id": "v0_chat_id" }` |

> **Generation flow:** SpaceBot → `POST /v0-designer` → v0.dev API → auto-saves to CRM (previews, threads, bot_tasks)
> **Edit flow:** SpaceBot → `GET /clawd-bot/previews` (get `chat_id`) → `POST /clawd-bot/site-config` (update content sections)
> **Structural edits only:** If layout/code changes are truly needed, use `POST /v0-designer` with `chat_id` in body. But prefer Site Configs for all content/media changes.

### Site Configs (Headless CMS for Client Websites)

| Action | Method | URL | Body / Params |
|--------|--------|-----|---------------|
| Read all sections | GET | `/clawd-bot/site-configs?site_id=slug&published=true` | **No auth required** — public endpoint for v0 sites |
| Create/Update section | POST | `/clawd-bot/site-config` | `{ "site_id": "slug", "section": "hero", "content": {...}, "customer_id": "uuid" }` |
| Delete section | DELETE | `/clawd-bot/site-config` | `{ "site_id": "slug", "section": "hero" }` or `{ "id": "uuid" }` |

> **Site Config sections**: `hero`, `about`, `services`, `gallery`, `contact`, `footer`, `meta`
> **site_id format**: kebab-case slug like `terrion-barber`, `jane-photography`
> Content is auto-versioned. Defaults to `is_published: true`.
> V0 sites fetch this on page load — updating a section = instant site update, no deploy needed.

#### Example: Update hero section
```json
POST /clawd-bot/site-config
{
  "site_id": "terrion-barber",
  "section": "hero",
  "content": {
    "headline": "Precision Cuts & Fades",
    "subheadline": "Atlanta's Premier Barbershop",
    "image_url": "https://example.com/hero.jpg",
    "cta_text": "Book Now",
    "cta_url": "https://calendly.com/terrion"
  }
}
```

### Previews (API-generated work)

| Action | Method | URL |
|--------|--------|-----|
| List | GET | `/clawd-bot/previews?customer_id=uuid&source=v0-designer` |

---

## Common Mistakes to AVOID

| ❌ Wrong | ✅ Correct |
|----------|-----------|
| `/clawd-bot/lead/list` | `GET /clawd-bot/customers` |
| `/clawd-bot/customer/{id}` | `POST /clawd-bot/customer` with `{"id":"uuid"}` in body |
| `PATCH /clawd-bot/lead/{id}` | `POST /clawd-bot/customer` with `{"id":"uuid"}` in body |
| `DELETE /clawd-bot/customer-delete` | `DELETE /clawd-bot/customer` with `{"id":"uuid"}` in body |
| `sdbpryzuhqberwgxiucg` | `mziuxsfxevjnmdwnrqjs` |
| Path params for IDs | IDs always go in JSON body |
| `/clawd-bot/customers/list` | `/clawd-bot/customers` |
| `category: "inbound"` | `category: "other"` (use valid values only) |
| Filtering by category by default | Omit `category` param to see ALL records |
| Editing v0 site via API for content | Use `POST /clawd-bot/site-config` instead |

---

## ⚠️ DELETE Pattern (CRITICAL)

**ALL delete operations use the SAME path as create/update — the HTTP method determines the action.**

```
DELETE /clawd-bot/customer   ← CORRECT (same path as POST)
DELETE /clawd-bot/customer-delete   ← WRONG (does not exist)
```

Body must contain: `{ "id": "uuid" }`

This applies to ALL entities: `customer`, `deal`, `project`, `board`, `card`, `document`, `list`, `label`, `checklist`, `checklist-item`, `transcription`, `interaction`, `communication`, `bot-task`, `meeting`, `automation`, `template`, `thread`, `comment`, `attach`, `invoice`, `site-config`.

Exception: `card-label` and `upload-token` use `{ "card_id": "uuid", "label_id": "uuid" }` and `{ "customer_id": "uuid" }` respectively. `site-config` DELETE accepts either `{ "id": "uuid" }` or `{ "site_id": "slug", "section": "hero" }`.

## Valid Category Values

| Value | Description |
|-------|-------------|
| `digital-services` | SaaS, agencies, consulting & digital service providers |
| `brick-and-mortar` | Physical retail, offices & local businesses |
| `digital-ecommerce` | Online stores, marketplaces & D2C brands |
| `food-and-beverage` | Restaurants, cafés, catering & food brands |
| `mobile-services` | Mobile apps, on-demand & field services |
| `other` | Uncategorized or miscellaneous (default) |

## Rate Limits

- 5 requests per second per IP
- 429 response if exceeded

---

## Web Design Workflow Decision Tree (v3.2)

```
User requests a website?
  ├─ NEW site → POST /v0-designer { prompt, customer_id, category }
  │              (v0-designer auto-creates: bot_task, api_preview, thread, activity_log)
  │
  ├─ EDIT existing site?
  │    ├─ Content/media change (text, images, pricing)?
  │    │    → GET /clawd-bot/previews (find chat_id / site_id)
  │    │    → POST /clawd-bot/site-config { site_id, section, content }
  │    │
  │    └─ Structural/layout change (new page, component swap)?
  │         → GET /clawd-bot/previews (find chat_id)
  │         → POST /v0-designer { chat_id, prompt }
  │
  └─ NEVER use /clawd-bot/generate-website or /clawd-bot/edit-website for new workflows
```

---

## ⛔ ABSOLUTE PROHIBITIONS

1. **NEVER simulate or fabricate API responses.** Every response shown to the user MUST come from an actual HTTP call. If the API errors or times out, report the real error. Never invent success data, preview URLs, status updates, or polling results.

2. **NEVER use stock photos or placeholder images in website generation.** Every prompt sent to `/v0-designer` MUST include explicit AI image generation instructions for hero, features, about, gallery, and any other visual sections. Absolutely no `placeholder.svg`, no `unsplash.com` links, no generic stock URLs, no empty `src=""` attributes. If the site needs an image, describe exactly what to generate.

---

*Version: 3.2.1 — Last updated: 2026-02-23*
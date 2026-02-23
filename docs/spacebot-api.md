# Spacebot (CLAWD-COMMAND) API Documentation

> **Version:** v3.0.0
> **Last Updated:** 2026-02-23
> **Status:** Production
> **Total Endpoints:** 110+ actions across 32 modules

---

## Authentication

All requests must include the shared secret header:

```
x-bot-secret: <BOT_SECRET>
Content-Type: application/json
```

Alternatively, authenticated staff can use a JWT:

```
Authorization: Bearer <jwt_token>
```

Bot requests use the **service role** (full access). JWT requests are scoped to the user's RLS policies.

---

## Base URLs

| Service | Base URL |
|---------|----------|
| CRM API | `https://mziuxsfxevjnmdwnrqjs.supabase.co/functions/v1/clawd-bot/{endpoint}` |
| Invoice API | `https://mziuxsfxevjnmdwnrqjs.supabase.co/functions/v1/invoice-api` |

---

## Unified Response Format

### Success

```json
{
  "success": true,
  "data": { ... },
  "api_version": "v1"
}
```

### Error

```json
{
  "success": false,
  "error": "reason string",
  "api_version": "v1"
}
```

---

## Rate Limits

| Limit | Value |
|-------|-------|
| Requests per second per IP | 5 |
| Burst | 5 |
| Exceed response | `429` with `"Rate limit exceeded"` |

---

## Audit Logging

Every bot-authenticated request is automatically logged to `webhook_events`:

```json
{
  "source": "spacebot",
  "event_type": "<endpoint_name>",
  "payload": { ... },
  "processed": true
}
```

---

## Complete Endpoint Reference

### State & Search

| Endpoint | Method | Purpose | Query Params |
|----------|--------|---------|--------------|
| `/clawd-bot/state` | GET | Full CRM snapshot | — |
| `/clawd-bot/search` | GET | Search customers | `?q=searchterm` |

### Customers

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/clawd-bot/customers` | GET | List (filters: `?status=`, `?category=`) |
| `/clawd-bot/customer` | POST | Create/Update |
| `/clawd-bot/customer` | DELETE | Delete |
| `/clawd-bot/bulk-delete` | POST | Bulk delete (max 100) |
| `/clawd-bot/lead` | POST | Create/update lead (dedup by email) |

### Deals

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/clawd-bot/deals` | GET | List |
| `/clawd-bot/deal` | POST | Create/Update |
| `/clawd-bot/deal` | DELETE | Delete |

### Projects

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/clawd-bot/projects` | GET | List |
| `/clawd-bot/project` | POST | Create/Update |
| `/clawd-bot/project` | DELETE | Delete |

### Tasks

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/clawd-bot/project-tasks` | GET | List (filter: `?project_id=`) |
| `/clawd-bot/project-task` | POST | Create/Update |
| `/clawd-bot/project-task` | DELETE | Delete |

### Invoices

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/clawd-bot/invoices` | GET | List |
| `/clawd-bot/invoice` | POST | Create/Update |
| `/clawd-bot/invoice` | DELETE | Delete |
| `/invoice-api` | POST | Create with line items + auto-calc |
| `/invoice-api` | GET | List by customer |
| `/invoice-api` | PATCH | Update status |

### Boards

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/clawd-bot/boards` | GET | List with lists+cards |
| `/clawd-bot/board` | POST | Create/Update |
| `/clawd-bot/board` | DELETE | Delete |

### Lists

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/clawd-bot/list` | POST | Create/Update |
| `/clawd-bot/list` | DELETE | Delete (cascades cards) |

### Cards

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/clawd-bot/card` | POST | Create/Update |
| `/clawd-bot/card` | DELETE | Delete |
| `/clawd-bot/move` | POST | Move to list |

### Comments

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/clawd-bot/comments` | GET | List (filter: `?card_id=`) |
| `/clawd-bot/comment` | POST | Create |
| `/clawd-bot/comment` | DELETE | Delete |

### Attachments

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/clawd-bot/attachments` | GET | List (filter: `?card_id=`) |
| `/clawd-bot/attach` | POST | Create |
| `/clawd-bot/attach` | DELETE | Delete |

### Labels

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/clawd-bot/labels` | GET | List (filter: `?board_id=`) |
| `/clawd-bot/label` | POST | Create |
| `/clawd-bot/label` | DELETE | Delete |

### Card Labels

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/clawd-bot/card-label` | POST | Assign label to card |
| `/clawd-bot/card-label` | DELETE | Remove label from card |

### Checklists

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/clawd-bot/checklists` | GET | List (filter: `?card_id=`) |
| `/clawd-bot/checklist` | POST | Create/Update |
| `/clawd-bot/checklist` | DELETE | Delete (cascades items) |

### Checklist Items

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/clawd-bot/checklist-item` | POST | Create/Update (toggle done) |
| `/clawd-bot/checklist-item` | DELETE | Delete |

### Content Assets

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/clawd-bot/content` | GET | List (filters: `?customer_id=`, `?source=`, `?type=`, `?category=`) |
| `/clawd-bot/content` | POST | Create/Update |
| `/clawd-bot/content` | DELETE | Delete |

### Templates

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/clawd-bot/templates` | GET | List (filters: `?type=`, `?category=`) |
| `/clawd-bot/template` | POST | Create/Update |
| `/clawd-bot/template` | DELETE | Delete |

### Threads

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/clawd-bot/threads` | GET | List (filter: `?customer_id=`) |
| `/clawd-bot/thread` | POST | Create/Update |
| `/clawd-bot/thread` | DELETE | Delete |

### Documents

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/clawd-bot/documents` | GET | List (filter: `?customer_id=`) |
| `/clawd-bot/document` | POST | Create/Update |
| `/clawd-bot/document` | DELETE | Delete |

### Communications

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/clawd-bot/communications` | GET | List (filters: `?customer_id=`, `?type=`) |
| `/clawd-bot/communication` | POST | Create/Update |
| `/clawd-bot/communication` | DELETE | Delete |

### Interactions

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/clawd-bot/interactions` | GET | List (filter: `?customer_id=`) |
| `/clawd-bot/interaction` | POST | Create/Update |
| `/clawd-bot/interaction` | DELETE | Delete |

### Signatures (read-only)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/clawd-bot/signatures` | GET | List (filters: `?customer_id=`, `?document_id=`) |

### Transcriptions

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/clawd-bot/transcriptions` | GET | List (filters: `?customer_id=`, `?source_type=`) |
| `/clawd-bot/transcription` | POST | Create/Update |
| `/clawd-bot/transcription` | DELETE | Delete |

### Bot Tasks

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/clawd-bot/bot-tasks` | GET | List (filter: `?status=`) |
| `/clawd-bot/bot-task` | POST | Create/Update |
| `/clawd-bot/bot-task` | DELETE | Delete |

### Meetings

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/clawd-bot/meetings` | GET | List |
| `/clawd-bot/meeting` | POST | Create/Update (returns `room_url`) |
| `/clawd-bot/meeting` | DELETE | Delete |

### Automations

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/clawd-bot/automations` | GET | List (filters: `?trigger_table=`, `?enabled=`) |
| `/clawd-bot/automation` | POST | Create/Update |
| `/clawd-bot/automation` | DELETE | Delete |
| `/clawd-bot/trigger` | POST | Evaluate and execute automations |

### Activity Log (read-only)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/clawd-bot/activity` | GET | List (filter: `?entity_type=`) |

### Upload Tokens (Custom-U Portal)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/clawd-bot/upload-token` | POST | Generate token (returns `portal_url`) |
| `/clawd-bot/upload-token` | DELETE | Revoke token |

### Generators

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/clawd-bot/generate-resume` | POST | Generate resume mock |
| `/clawd-bot/generate-contract` | POST | Generate contract mock |
| `/clawd-bot/generate-email` | POST | Generate client email |
| `/clawd-bot/analyze-thread` | POST | Analyze transcript for missing info |

### Web Design (v0 Designer)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/clawd-bot/generate-website` | POST | Generate new v0 website |
| `/clawd-bot/edit-website` | POST | Edit existing v0 website (requires `chat_id`) |
| `/clawd-bot/v0-designer` | POST | Generic v0 call (create or edit) |
| `/clawd-bot/publish-website` | POST | Deploy to Vercel (requires manual linking) |

### Site Configs (Headless CMS)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/clawd-bot/site-configs` | GET | Read site content sections (**PUBLIC — no auth**). Params: `?site_id=slug&published=true` |
| `/clawd-bot/site-config` | POST | Create/update a content section |
| `/clawd-bot/site-config` | DELETE | Delete a content section |

### Previews

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/clawd-bot/previews` | GET | List API-generated work (filter: `?customer_id=`, `?source=`) |

---

## Delete Pattern

All singular endpoints support DELETE via HTTP method:

```
DELETE /clawd-bot/customer   → { "id": "uuid" }
DELETE /clawd-bot/deal       → { "id": "uuid" }
DELETE /clawd-bot/project    → { "id": "uuid" }
DELETE /clawd-bot/site-config → { "id": "uuid" } or { "site_id": "slug", "section": "hero" }
...etc
```

Exception: `card-label` uses `{ "card_id": "uuid", "label_id": "uuid" }`, `upload-token` uses `{ "customer_id": "uuid" }`

---

## Error Codes

| HTTP Code | Meaning |
|-----------|---------|
| 400 | Bad request / validation error |
| 401 | Unauthorized (missing or invalid secret/JWT) |
| 404 | Unknown endpoint |
| 429 | Rate limit exceeded |
| 500 | Internal server error |

---

*Version: 3.1.0 — Last updated: 2026-02-23*
# CLAWD Command CRM — Agent API Reference

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

## Endpoints Quick Reference

### Customers

| Action | Method | URL | Body |
|--------|--------|-----|------|
| List | GET | `/clawd-bot/customers` | — |
| List filtered | GET | `/clawd-bot/customers?status=lead&category=inbound` | — |
| Create | POST | `/clawd-bot/customer` | `{ "full_name": "..." }` |
| Update | POST | `/clawd-bot/customer` | `{ "id": "uuid", "full_name": "New Name" }` |
| Delete | DELETE | `/clawd-bot/customer` | `{ "id": "uuid" }` |
| Bulk Delete | POST | `/clawd-bot/bulk-delete` | `{ "ids": ["uuid1", "uuid2", ...] }` |

> **⚠️ DELETE vs POST**: To remove customers use `DELETE /clawd-bot/customer` or `POST /clawd-bot/bulk-delete`. **Never** use `POST /clawd-bot/customer` to delete — that creates/updates records.

### Leads (shortcut — creates customer with status=lead)

| Action | Method | URL | Body |
|--------|--------|-----|------|
| Create/Update | POST | `/clawd-bot/lead` | `{ "full_name": "...", "email": "...", "source": "..." }` |

### Deals

| Action | Method | URL | Body |
|--------|--------|-----|------|
| List | GET | `/clawd-bot/deals` | — |
| List filtered | GET | `/clawd-bot/deals?status=open&category=web` | — |
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

### Cards

| Action | Method | URL | Body |
|--------|--------|-----|------|
| Create | POST | `/clawd-bot/card` | `{ "board_id": "uuid", "list_id": "uuid", "title": "..." }` |
| Update | POST | `/clawd-bot/card` | `{ "id": "uuid", "title": "Updated" }` |
| Delete | DELETE | `/clawd-bot/card` | `{ "id": "uuid" }` |
| Move | POST | `/clawd-bot/move` | `{ "card_id": "uuid", "list_id": "target_uuid" }` |
| Comment | POST | `/clawd-bot/comment` | `{ "card_id": "uuid", "body": "..." }` |
| Attach | POST | `/clawd-bot/attach` | `{ "card_id": "uuid", "url": "...", "type": "link" }` |

### Content Assets

| Action | Method | URL | Body |
|--------|--------|-----|------|
| List | GET | `/clawd-bot/content` | — |
| List filtered | GET | `/clawd-bot/content?customer_id=uuid&source=instagram&type=image&category=digital-services` | — |
| Create | POST | `/clawd-bot/content` | `{ "title": "...", "type": "post", "source": "instagram", "customer_id": "uuid" }` |
| Update | POST | `/clawd-bot/content` | `{ "id": "uuid", "status": "published", "source": "client-direct" }` |
| Delete | DELETE | `/clawd-bot/content` | `{ "id": "uuid" }` |

> **Content types**: `article`, `image`, `video`, `landing_page`, `doc`, `post`
> **Source values**: `dashboard`, `google-drive`, `instagram`, `sms`, `client-direct`, `other`
> **Folder convention**: `{Category}/{Customer Name}/{Source Label}` — auto-set by the UI, can be overridden via API

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
| Delete | DELETE | `/clawd-bot/document` | `{ "id": "uuid" }` |

### Templates

| Action | Method | URL | Body |
|--------|--------|-----|------|
| List | GET | `/clawd-bot/templates?type=contract&category=digital-services` | — |
| Create | POST | `/clawd-bot/template` | `{ "name": "...", "type": "contract", "body_html": "<h1>...</h1>", "placeholders": ["{{client_name}}"] }` |
| Update | POST | `/clawd-bot/template` | `{ "id": "uuid", "body_html": "..." }` |
| Delete | DELETE | `/clawd-bot/template` | `{ "id": "uuid" }` |

> **Template types**: `contract`, `proposal`, `invoice`, `email`
> **Supported placeholders**: `{{client_name}}`, `{{company_name}}`, `{{company_address}}`, `{{client_email}}`, `{{date}}`

### Communications

| Action | Method | URL | Body |
|--------|--------|-----|------|
| List | GET | `/clawd-bot/communications?customer_id=uuid&type=email` | — |
| Create | POST | `/clawd-bot/communication` | `{ "type": "email", "customer_id": "uuid", ... }` |
| Delete | DELETE | `/clawd-bot/communication` | `{ "id": "uuid" }` |

### Signatures (read-only)

| Action | Method | URL |
|--------|--------|-----|
| List | GET | `/clawd-bot/signatures?customer_id=uuid` |

### Interactions

| Action | Method | URL | Body |
|--------|--------|-----|------|
| List | GET | `/clawd-bot/interactions?customer_id=uuid` | — |
| Create | POST | `/clawd-bot/interaction` | `{ "customer_id": "uuid", "type": "call" }` |

### Bot Tasks

| Action | Method | URL | Body |
|--------|--------|-----|------|
| List | GET | `/clawd-bot/bot-tasks?status=queued` | — |
| Create | POST | `/clawd-bot/bot-task` | `{ "title": "...", "bot_agent": "cortex" }` |
| Update | POST | `/clawd-bot/bot-task` | `{ "id": "uuid", "status": "done" }` |
| Delete | DELETE | `/clawd-bot/bot-task` | `{ "id": "uuid" }` |

### Labels

| Action | Method | URL | Body |
|--------|--------|-----|------|
| List | GET | `/clawd-bot/labels?board_id=uuid` | — |
| Create | POST | `/clawd-bot/label` | `{ "board_id": "uuid", "name": "urgent", "color": "red" }` |

### Automations

| Action | Method | URL | Body |
|--------|--------|-----|------|
| List | GET | `/clawd-bot/automations?enabled=true` | — |
| Create | POST | `/clawd-bot/automation` | `{ "name": "...", "trigger_table": "customers", "trigger_event": "insert", ... }` |
| Delete | DELETE | `/clawd-bot/automation` | `{ "id": "uuid" }` |

### Meetings

| Action | Method | URL | Body |
|--------|--------|-----|------|
| List | GET | `/clawd-bot/meetings?status=waiting` | — |
| Create | POST | `/clawd-bot/meeting` | `{ "title": "Kickoff" }` |
| Update | POST | `/clawd-bot/meeting` | `{ "id": "uuid", "status": "active" }` |
| Delete | DELETE | `/clawd-bot/meeting` | `{ "id": "uuid" }` |

### Activity Log (read-only)

| Action | Method | URL |
|--------|--------|-----|
| List | GET | `/clawd-bot/activity?entity_type=customers` |

### Email Generation

| Action | Method | URL | Body |
|--------|--------|-----|------|
| Generate portal invite | POST | `/clawd-bot/generate-email` | `{ "customer_id": "uuid" }` |

### CRM State (full snapshot)

| Action | Method | URL |
|--------|--------|-----|
| Get all | GET | `/clawd-bot/state` |

> Returns: `boards`, `customers`, `deals`, `projects`, `meetings`, `templates`, `content`

---

## Common Mistakes to AVOID

| ❌ Wrong | ✅ Correct |
|----------|-----------|
| `/clawd-bot/lead/list` | `GET /clawd-bot/customers` |
| `/clawd-bot/customer/{id}` | `POST /clawd-bot/customer` with `{"id":"uuid"}` in body |
| `PATCH /clawd-bot/lead/{id}` | `POST /clawd-bot/customer` with `{"id":"uuid"}` in body |
| `DELETE /clawd-bot/customer-delete` | `DELETE /clawd-bot/customer` with `{"id":"uuid"}` in body |
| `DELETE /clawd-bot/deal-delete` | `DELETE /clawd-bot/deal` with `{"id":"uuid"}` in body |
| `sdbpryzuhqberwgxiucg` | `mziuxsfxevjnmdwnrqjs` |
| Path params for IDs | IDs always go in JSON body |
| `/clawd-bot/customers/list` | `/clawd-bot/customers` |
| `category: "inbound"` | `category: "other"` (use valid values only) |
| Filtering by category by default | Omit `category` param to see ALL records |

---

## ⚠️ DELETE Pattern (CRITICAL)

**ALL delete operations use the SAME path as create/update — the HTTP method determines the action.**

```
DELETE /clawd-bot/customer   ← CORRECT (same path as POST)
DELETE /clawd-bot/customer-delete   ← WRONG (does not exist)
```

Body must contain: `{ "id": "uuid-of-record" }`

This applies to ALL entities: `customer`, `deal`, `project`, `board`, `card`, `document`, etc.

## Default Query Behavior

- `GET /clawd-bot/customers` → returns ALL customers (no filters)
- `GET /clawd-bot/customers?status=lead` → returns only leads
- Do NOT add `category` filter unless the user explicitly asks for a specific category

---

## Valid Category Values

When setting `category` on any entity, use ONLY these values:

| Value | Description |
|-------|-------------|
| `digital-services` | SaaS, agencies, consulting & digital service providers |
| `brick-and-mortar` | Physical retail, offices & local businesses |
| `digital-ecommerce` | Online stores, marketplaces & D2C brands |
| `food-and-beverage` | Restaurants, cafés, catering & food brands |
| `mobile-services` | Mobile apps, on-demand & field services |
| `other` | Uncategorized or miscellaneous (default) |

Any unrecognized category value will be auto-mapped to `other`.

## Rate Limits

- 5 requests per second per IP
- 429 response if exceeded

---

*Last updated: 2026-02-21*

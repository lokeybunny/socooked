# Spacebot (CLAWD-COMMAND) API Documentation

> **Version:** v1
> **Last Updated:** 2026-02-19
> **Status:** Production

---

## Authentication

All requests must include the shared secret header:

```
x-bot-secret: <BOT_SECRET>
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

**Every** response follows this shape:

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
  "payload": { ... request body ... },
  "processed": true
}
```

---

## Recommended Workflow

```
1. GET /clawd-bot/state        → Snapshot of boards, customers, deals, projects, meetings
2. POST /clawd-bot/lead        → Create or update a lead
3. POST /clawd-bot/deal        → Create a deal for the customer
4. POST /clawd-bot/project     → Create a project
5. POST /clawd-bot/meeting     → Schedule a meeting, get room_url
6. POST /clawd-bot/generate-email → Generate email with meeting link
7. POST /invoice-api           → Create and send invoice
```

---

## Endpoints — CRM API (`/clawd-bot/*`)

---

### `GET /clawd-bot/state`

**Purpose:** System-wide snapshot for context-first workflow.

**Request:** No body required.

**Response:**
```json
{
  "success": true,
  "data": {
    "boards": [...],
    "customers": [...],
    "deals": [...],
    "projects": [...],
    "meetings": [...]
  }
}
```

---

### `POST /clawd-bot/customer`

**Purpose:** Create or update a customer.

**Required fields (create):** `full_name`

**Request (create):**
```json
{
  "full_name": "Jane Doe",
  "email": "jane@example.com",
  "phone": "+1-818-555-0100",
  "status": "lead",
  "category": "web_dev"
}
```

**Request (update):**
```json
{
  "id": "uuid",
  "status": "active",
  "phone": "+1-818-555-0200"
}
```

**Response:**
```json
{
  "success": true,
  "data": { "action": "created", "customer_id": "uuid" }
}
```

---

### `POST /clawd-bot/lead`

**Purpose:** Shortcut to create or update a lead. Deduplicates by email.

**Required fields:** `full_name`

**Request:**
```json
{
  "full_name": "John Smith",
  "email": "john@example.com",
  "phone": "+1-702-555-0100",
  "source": "instagram",
  "category": "branding"
}
```

**Response:**
```json
{
  "success": true,
  "data": { "action": "created", "customer_id": "uuid" }
}
```

---

### `POST /clawd-bot/deal`

**Purpose:** Create or update a deal.

**Required fields (create):** `title`, `customer_id`

**Request (create):**
```json
{
  "title": "Website Redesign",
  "customer_id": "uuid",
  "deal_value": 5000,
  "stage": "proposal",
  "category": "web_dev"
}
```

**Request (update):**
```json
{
  "id": "uuid",
  "stage": "won",
  "status": "closed"
}
```

---

### `POST /clawd-bot/project`

**Purpose:** Create or update a project.

**Required fields (create):** `title`

**Request:**
```json
{
  "title": "Brand Identity Package",
  "customer_id": "uuid",
  "status": "planned",
  "priority": "high",
  "category": "branding"
}
```

---

### `POST /clawd-bot/project-task`

**Purpose:** Create or update a project task.

**Required fields (create):** `title`, `project_id`

**Request:**
```json
{
  "title": "Design logo concepts",
  "project_id": "uuid",
  "status": "todo",
  "priority": "high",
  "due_date": "2026-03-01"
}
```

---

### `POST /clawd-bot/card`

**Purpose:** Create or update a Kanban card.

**Required fields (create):** `board_id`, `list_id`, `title`

**Request:**
```json
{
  "board_id": "uuid",
  "list_id": "uuid",
  "title": "Follow up with client",
  "priority": "high",
  "description": "Discuss contract terms"
}
```

---

### `POST /clawd-bot/move`

**Purpose:** Move a card to a different list.

**Required fields:** `card_id`, `to_list_id`

**Request:**
```json
{
  "card_id": "uuid",
  "to_list_id": "uuid"
}
```

---

### `POST /clawd-bot/document`

**Purpose:** Create or update a document record.

**Required fields (create):** `title`, `type`, `customer_id`

**Request:**
```json
{
  "title": "John Smith Resume",
  "type": "resume",
  "customer_id": "uuid",
  "status": "draft"
}
```

---

### `POST /clawd-bot/meeting`

**Purpose:** Create, update, or delete a meeting. Returns `room_url` for video conferencing.

**Required fields (create):** None (defaults to "Meeting")

**Request (create):**
```json
{
  "title": "Client Onboarding Call",
  "scheduled_at": "2026-02-20T15:00:00Z",
  "category": "web_dev"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "action": "created",
    "meeting": {
      "id": "uuid",
      "title": "Client Onboarding Call",
      "room_code": "a1b2c3d4e5f6",
      "status": "waiting",
      "scheduled_at": "2026-02-20T15:00:00Z",
      "category": "web_dev"
    },
    "room_url": "/meet/a1b2c3d4e5f6"
  }
}
```

**Request (delete):**
```json
{ "id": "uuid", "_delete": true }
```

---

### `POST /clawd-bot/generate-resume`

**Purpose:** Generate a resume (mock PDF).

**Request:**
```json
{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "resume_style": "modern"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "pdf_base64": "MOCK_PDF_BASE64_RESUME_PLACEHOLDER",
    "resume_json": { "name": "Jane Doe", "skills": [...] }
  }
}
```

---

### `POST /clawd-bot/generate-contract`

**Purpose:** Generate a service contract (mock PDF).

**Request:**
```json
{
  "client_name": "Jane Doe",
  "terms": { "price": 400, "deposit": 200 },
  "contract_template": "resume_service_v1"
}
```

---

### `POST /clawd-bot/generate-email`

**Purpose:** Generate a client-facing email with portal/meeting link.

**Request:**
```json
{
  "customer_name": "Jane Doe",
  "portal_link": "https://socooked.lovable.app/meet/a1b2c3d4e5f6"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "subject": "Your documents are ready — Jane Doe",
    "body_html": "<p>Hi Jane Doe,</p>...",
    "body_text": "Hi Jane Doe, your documents are ready..."
  }
}
```

---

### `POST /clawd-bot/analyze-thread`

**Purpose:** Analyze a conversation transcript for missing client info.

**Request:**
```json
{
  "transcript": "My name is Jane, email jane@test.com, call me at 555-0100"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "ready_for_docs",
    "missing_fields": [],
    "summary": "All required information collected."
  }
}
```

---

## Endpoints — Invoice API (`/invoice-api`)

---

### `POST /invoice-api`

**Purpose:** Create an invoice.

**Required fields:** `line_items` + (`customer_id` OR `customer_email`)

**Request:**
```json
{
  "customer_id": "uuid",
  "line_items": [
    { "description": "Website Design", "quantity": 1, "unit_price": 2500 },
    { "description": "SEO Setup", "quantity": 1, "unit_price": 500 }
  ],
  "tax_rate": 8.5,
  "currency": "USD",
  "due_date": "2026-03-15",
  "auto_send": true
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "invoice": {
      "id": "uuid",
      "invoice_number": "INV-01005",
      "amount": 3255,
      "status": "sent"
    }
  }
}
```

---

### `GET /invoice-api?customer_id=uuid`

**Purpose:** List invoices for a customer (limit 50).

---

### `PATCH /invoice-api?id=uuid`

**Purpose:** Update invoice status.

**Request:**
```json
{ "status": "paid" }
```

---

## Additional Read Endpoints (GET)

| Endpoint | Purpose | Query Params |
|----------|---------|--------------|
| `GET /clawd-bot/customers` | List customers | `?status=lead&category=web_dev` |
| `GET /clawd-bot/deals` | List deals | `?status=open&category=branding` |
| `GET /clawd-bot/projects` | List projects | `?status=active&category=web_dev` |
| `GET /clawd-bot/project-tasks` | List tasks | `?project_id=uuid&category=web_dev` |
| `GET /clawd-bot/documents` | List documents | `?customer_id=uuid` |
| `GET /clawd-bot/invoices` | List invoices | `?customer_id=uuid&status=draft` |
| `GET /clawd-bot/communications` | List comms | `?customer_id=uuid&type=email` |
| `GET /clawd-bot/signatures` | List signatures | `?customer_id=uuid` |
| `GET /clawd-bot/interactions` | List interactions | `?customer_id=uuid` |
| `GET /clawd-bot/boards` | List boards + lists + cards | — |
| `GET /clawd-bot/bot-tasks` | List bot tasks | `?status=queued` |
| `GET /clawd-bot/activity` | List activity log | `?entity_type=customer` |
| `GET /clawd-bot/labels` | List labels | `?board_id=uuid` |
| `GET /clawd-bot/automations` | List automations | `?trigger_table=customers&enabled=true` |
| `GET /clawd-bot/meetings` | List meetings | — |

---

## Delete Pattern

All singular endpoints support DELETE via method:

```
DELETE /clawd-bot/customer   → { "id": "uuid" }
DELETE /clawd-bot/deal       → { "id": "uuid" }
DELETE /clawd-bot/project    → { "id": "uuid" }
DELETE /clawd-bot/meeting    → { "id": "uuid" }
...etc
```

Or via POST with `_delete` flag:

```json
POST /clawd-bot/meeting → { "id": "uuid", "_delete": true }
```

---

## Automation Engine

### `POST /clawd-bot/trigger`

**Purpose:** Evaluate automation rules and execute matching actions.

**Request:**
```json
{
  "event": "INSERT",
  "table": "customers",
  "payload": { "id": "uuid", "customer_id": "uuid" }
}
```

**Supported action types:**
- `create_task` — Creates a bot task
- `update_status` — Updates a record's status
- `create_interaction` — Logs an interaction
- `create_card` — Adds a card to a board

---

## Error Codes

| HTTP Code | Meaning |
|-----------|---------|
| 400 | Bad request / validation error |
| 401 | Unauthorized (missing or invalid secret/JWT) |
| 404 | Unknown endpoint |
| 405 | Method not allowed |
| 429 | Rate limit exceeded |
| 500 | Internal server error |

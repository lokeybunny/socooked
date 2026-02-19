# SpaceBot (CLAWD-COMMAND) Integration Guide

> **Version:** v1  
> **Last Updated:** 2026-02-19

---

## Base URLs

| Service     | URL                                                                             |
|-------------|---------------------------------------------------------------------------------|
| CRM API     | `https://mziuxsfxevjnmdwnrqjs.supabase.co/functions/v1/clawd-bot/{endpoint}`   |
| Invoice API | `https://mziuxsfxevjnmdwnrqjs.supabase.co/functions/v1/invoice-api`            |

---

## Authentication

### Bot (machine-to-machine)

All bot requests **must** include:

```
x-bot-secret: <BOT_SECRET>
Content-Type: application/json
```

Bot calls use the **service role** key internally — full database access, no RLS.

### Staff (human users)

```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

Staff calls are scoped to the user's RLS policies via `supabase.auth.getUser(token)`.

---

## Required Secrets

Both edge functions require these environment variables (set as Supabase secrets):

| Secret                    | Purpose                                      |
|---------------------------|----------------------------------------------|
| `BOT_SECRET`              | Shared secret for bot authentication         |
| `SUPABASE_URL`            | Supabase project URL                         |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (bot calls)               |
| `SUPABASE_ANON_KEY`       | Anon key (staff JWT validation)              |

---

## Unified Response Format

**Every** response follows this shape:

### Success

```json
{
  "success": true,
  "data": { "..." : "..." },
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

| Limit                     | Value |
|---------------------------|-------|
| Requests per second per IP | 5     |
| Exceed response            | `429` with `"Rate limit exceeded"` |

---

## Audit Logging

**Only bot-authenticated** requests are logged to `webhook_events`:

```json
{
  "source": "spacebot",
  "event_type": "<endpoint_name>",
  "payload": { "...request body..." : "" },
  "processed": true
}
```

Staff JWT calls are **not** audit-logged.

---

## Happy Path: STORE FIRST, THEN ACT

The recommended workflow is: **create the data record first**, then perform actions against it.

### 1. Create a Lead

**POST** `https://mziuxsfxevjnmdwnrqjs.supabase.co/functions/v1/clawd-bot/lead`

**Request:**

```json
{
  "full_name": "Jane Doe",
  "email": "jane@example.com",
  "phone": "+1-818-555-0100",
  "source": "instagram",
  "category": "web_dev"
}
```

**Response:**

```json
{
  "success": true,
  "data": { "action": "created", "customer_id": "uuid-1234" },
  "api_version": "v1"
}
```

### 2. Create a Deal

**POST** `https://mziuxsfxevjnmdwnrqjs.supabase.co/functions/v1/clawd-bot/deal`

**Request:**

```json
{
  "title": "Website Redesign",
  "customer_id": "uuid-1234",
  "deal_value": 5000,
  "stage": "proposal",
  "category": "web_dev"
}
```

**Response:**

```json
{
  "success": true,
  "data": { "action": "created", "deal_id": "uuid-5678" },
  "api_version": "v1"
}
```

### 3. Create a Project Task (optional)

**POST** `https://mziuxsfxevjnmdwnrqjs.supabase.co/functions/v1/clawd-bot/project-task`

**Request:**

```json
{
  "project_id": "uuid-proj",
  "title": "Design mockups",
  "priority": "high",
  "status": "todo"
}
```

**Response:**

```json
{
  "success": true,
  "data": { "action": "created", "task_id": "uuid-task" },
  "api_version": "v1"
}
```

### 4. Create a Board Card (optional)

**POST** `https://mziuxsfxevjnmdwnrqjs.supabase.co/functions/v1/clawd-bot/card`

**Request:**

```json
{
  "board_id": "uuid-board",
  "list_id": "uuid-list",
  "title": "Client onboarding checklist",
  "priority": "high",
  "customer_id": "uuid-1234"
}
```

**Response:**

```json
{
  "success": true,
  "data": { "action": "created", "card_id": "uuid-card" },
  "api_version": "v1"
}
```

### 5. Create a Meeting

**POST** `https://mziuxsfxevjnmdwnrqjs.supabase.co/functions/v1/clawd-bot/meeting`

**Request:**

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
    "meeting": { "id": "uuid-9012", "room_code": "a1b2c3d4e5f6" },
    "room_url": "/meet/a1b2c3d4e5f6"
  },
  "api_version": "v1"
}
```

### 6. Generate Client Email

**POST** `https://mziuxsfxevjnmdwnrqjs.supabase.co/functions/v1/clawd-bot/generate-email`

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
  },
  "api_version": "v1"
}
```

### 7. Create Invoice

**POST** `https://mziuxsfxevjnmdwnrqjs.supabase.co/functions/v1/invoice-api`

**Request:**

```json
{
  "customer_id": "uuid-1234",
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
      "id": "uuid-inv",
      "invoice_number": "INV-01005",
      "amount": 3255,
      "status": "sent"
    }
  },
  "api_version": "v1"
}
```

---

## Troubleshooting

| Code | Cause | Fix |
|------|-------|-----|
| **401** Unauthorized | Missing or invalid `x-bot-secret` header, or expired JWT | Verify the `BOT_SECRET` secret matches. For JWT, ensure token is valid and not expired. |
| **429** Rate Limited | More than 5 requests/sec from the same IP | Back off and retry after 1 second. Use exponential backoff for bursts. |
| **404** Not Found | Unknown endpoint path | Check the endpoint path matches exactly (e.g., `/clawd-bot/lead`, not `/clawd-bot/leads`). Singular = write, plural = read. |
| **400** Bad Request | Missing required fields | Check the error message — it tells you which field is missing (e.g., `"full_name is required"`). |
| **500** Internal Error | Database or runtime failure | Check the `error` field in the response. Common causes: invalid UUID, foreign key violation. |

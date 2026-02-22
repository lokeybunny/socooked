# SpaceBot (CLAWD-COMMAND) Integration Guide

> **Version:** v3.0.0  
> **Last Updated:** 2026-02-22

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

### 1. Search for existing customer

**GET** `/clawd-bot/search?q=Jane`

### 2. Create a Lead

**POST** `/clawd-bot/lead`

```json
{
  "full_name": "Jane Doe",
  "email": "jane@example.com",
  "phone": "+1-818-555-0100",
  "source": "instagram",
  "category": "digital-services"
}
```

### 3. Create a Deal

**POST** `/clawd-bot/deal`

```json
{
  "title": "Website Redesign",
  "customer_id": "uuid-1234",
  "deal_value": 5000,
  "stage": "proposal",
  "category": "digital-services"
}
```

### 4. Create a Project

**POST** `/clawd-bot/project`

```json
{
  "title": "Brand Identity Package",
  "customer_id": "uuid-1234",
  "status": "planned",
  "priority": "high"
}
```

### 5. Create a Board Card

**POST** `/clawd-bot/card`

```json
{
  "board_id": "uuid-board",
  "list_id": "uuid-list",
  "title": "Client onboarding checklist",
  "priority": "high",
  "customer_id": "uuid-1234"
}
```

### 6. Add Checklist to Card

**POST** `/clawd-bot/checklist` → `{ "card_id": "uuid-card", "title": "Onboarding Steps" }`

**POST** `/clawd-bot/checklist-item` → `{ "checklist_id": "uuid-cl", "content": "Send welcome email" }`

### 7. Create a Meeting

**POST** `/clawd-bot/meeting`

```json
{
  "title": "Client Onboarding Call",
  "scheduled_at": "2026-02-20T15:00:00Z"
}
```

### 8. Generate Upload Portal

**POST** `/clawd-bot/upload-token` → `{ "customer_id": "uuid-1234" }`

Returns: `{ "portal_url": "https://stu25.com/u/TOKEN" }`

### 9. Generate Client Email

**POST** `/clawd-bot/generate-email`

```json
{
  "customer_name": "Jane Doe",
  "portal_link": "https://stu25.com/meet/a1b2c3d4e5f6"
}
```

### 10. Create Invoice

**POST** `/invoice-api`

```json
{
  "customer_id": "uuid-1234",
  "line_items": [
    { "description": "Website Design", "quantity": 1, "unit_price": 2500 }
  ],
  "tax_rate": 8.5,
  "auto_send": true
}
```

---

## Module Coverage (v3.0.0)

| Module | List | Create | Update | Delete | Notes |
|--------|------|--------|--------|--------|-------|
| Customers | ✅ | ✅ | ✅ | ✅ | + bulk delete, search |
| Leads | — | ✅ | ✅ | — | Shortcut for customer with status=lead |
| Deals | ✅ | ✅ | ✅ | ✅ | |
| Projects | ✅ | ✅ | ✅ | ✅ | |
| Tasks | ✅ | ✅ | ✅ | ✅ | |
| Invoices | ✅ | ✅ | ✅ | ✅ | + invoice-api with line items |
| Boards | ✅ | ✅ | ✅ | ✅ | |
| Lists | — | ✅ | ✅ | ✅ | |
| Cards | — | ✅ | ✅ | ✅ | + move |
| Comments | ✅ | ✅ | — | ✅ | |
| Attachments | ✅ | ✅ | — | ✅ | |
| Labels | ✅ | ✅ | — | ✅ | |
| Card Labels | — | ✅ | — | ✅ | Assign/remove |
| Checklists | ✅ | ✅ | ✅ | ✅ | |
| Checklist Items | — | ✅ | ✅ | ✅ | |
| Content | ✅ | ✅ | ✅ | ✅ | |
| Templates | ✅ | ✅ | ✅ | ✅ | |
| Threads | ✅ | ✅ | ✅ | ✅ | |
| Documents | ✅ | ✅ | ✅ | ✅ | |
| Communications | ✅ | ✅ | ✅ | ✅ | |
| Interactions | ✅ | ✅ | ✅ | ✅ | |
| Signatures | ✅ | — | — | — | Read-only |
| Transcriptions | ✅ | ✅ | ✅ | ✅ | NEW in v3 |
| Bot Tasks | ✅ | ✅ | ✅ | ✅ | |
| Meetings | ✅ | ✅ | ✅ | ✅ | |
| Automations | ✅ | ✅ | ✅ | ✅ | + trigger |
| Activity Log | ✅ | — | — | — | Read-only |
| Upload Tokens | — | ✅ | — | ✅ | Generate/revoke |
| Email (Gmail) | ✅ | ✅ | — | — | Inbox, sent, drafts, send, save-draft |
| Generators | — | ✅ | — | — | Resume, contract, email, analyze |

---

## Troubleshooting

| Code | Cause | Fix |
|------|-------|-----|
| **401** Unauthorized | Missing or invalid `x-bot-secret` | Verify the `BOT_SECRET` secret matches |
| **429** Rate Limited | >5 req/sec from same IP | Back off and retry after 1 second |
| **404** Not Found | Unknown endpoint | Check path exactly (singular=write, plural=read) |
| **400** Bad Request | Missing required fields | Check error message |
| **500** Internal Error | DB or runtime failure | Check `error` field |

---

*Version: 3.0.0 — Last updated: 2026-02-22*
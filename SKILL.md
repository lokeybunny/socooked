# clawd-command-crm-skill

CRM integration for CLAWD Command via SpaceBot.

## Version

1.1.0

## Description

Cortex Skill for safe CRM operations: customer lookup, create, update, delete, deals, and invoices.  
Ensures lookup → update → create flow, respects rate limits, logs all actions, and returns consistent responses for Telegram or other frontends.

## Auth

| Type | Method |
|------|--------|
| `shared_secret` | Plain shared secret sent as HTTP header |

### Required Header

| Header | Value |
|--------|-------|
| `x-bot-secret` | Stored in secret manager; never hardcode in code |

## Base URL

## Actions

| Name | Method | Path | Description |
|------|--------|------|-------------|
| `get_state` | GET | `/clawd-bot/state` | Get CRM snapshot |
| `list_customers` | GET | `/clawd-bot/lead/list` | Return all customers or filtered by email/name |
| `create_or_update_lead` | POST | `/clawd-bot/lead` | Create or update lead after lookup |
| `create_or_update_customer` | POST | `/clawd-bot/customer` | Create or update customer (include `id` to update) |
| `delete_customer` | DELETE | `/clawd-bot/customer` | Delete customer by `id` in body `{"id":"uuid"}` |
| `create_deal` | POST | `/clawd-bot/deal` | Create deal |
| `create_invoice` | POST | `/invoice-api` | Create invoice |

## Customer Lookup & Safe Create/Update Flow

1. **Lookup**: Check if customer exists by email or full_name using `list_customers` endpoint.  
2. **Decision**:
   - If `customer_id` exists → PATCH `/clawd-bot/customer/{customer_id}` with updates.
   - If not → POST `/clawd-bot/lead` to create a new customer.  
3. **Rate Limiting**:
   - Pause 10–15 seconds between requests if throttled.  
   - Retry once on HTTP 429 errors, log reason.  
4. **Logging**:
   - Record timestamp, endpoint, request, response in Cortex memory.  
   - Track last 50 actions to prevent duplicates.  
5. **Security**:
   - Always validate `x-bot-secret` is present.  
   - Never execute CRM write without a valid secret.  

## Input Example

```json
{
  "full_name": "Billy",
  "email": "billy@example.com",
  "category": "inbound",
  "source": "telegram",
  "notes": "Intake recorded via Telegram bot"
}

| Name | Method | Path | Description |
|------|--------|------|-------------|
| `create_meeting` | POST | `/clawd-bot/card` | Create a CRM card/task for meetings, events, or follow-ups |

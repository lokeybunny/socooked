# clawd-command-crm

CRM integration for CLAWD Command via SpaceBot.

## Version

1.0.0

## Description

Connects SpaceBot to the CLAWD Command CRM backend, enabling lead management, deal creation, invoicing, and full CRM state retrieval via Supabase Edge Functions.

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

### Example cURL

```bash
curl -H "x-bot-secret: XOXOetkgmcdmFd1hAbGfQA8aDvfTQQ8U5f" \
     -H "Content-Type: application/json" \
     https://mziuxsfxevjnmdwnrqjs.supabase.co/functions/v1/clawd-bot/state
```

### Delete a customer

```bash
curl -X POST \
     -H "x-bot-secret: XOXOetkgmcdmFd1hAbGfQA8aDvfTQQ8U5f" \
     -H "Content-Type: application/json" \
     -d '{"id": "customer-uuid-here"}' \
     https://mziuxsfxevjnmdwnrqjs.supabase.co/functions/v1/clawd-bot/customer
```
To delete, POST to `/clawd-bot/customer` with `{"id": "uuid"}` in the body.

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

## Manifest

See [`skill.json`](./skill.json) for the machine-readable skill definition.

## Install

```
lokeybunny/clawd-command-crm-skill
```


# Customer Lookup & Safe Create/Update Skill

## Description
This skill handles safe customer creation or updating in the CRM. Cortex will:

1. Lookup an existing customer by name/email.
2. Return customer_id if found.
3. If not found, create a new customer.
4. Handle rate limits, retries, and logging automatically.

---

## Instructions for Cortex
- Always check if a customer exists before creating.
- Use `/clawd-bot/customers?filter=name_or_email` for lookup.
- If `customer_id` exists → PATCH `/clawd-bot/customer/{customer_id}` with updates.
- If not → POST `/clawd-bot/lead` to create new.
- Respect API rate limits: pause 10–15 seconds between requests if throttled.
- Log all requests in Cortex memory.
- Never execute a create/update without valid BOT_SECRET.

---

## Input Example
```json
{
  "full_name": "Billy",
  "email": "billy@example.com",
  "category": "inbound",
  "source": "telegram",
  "notes": "Intake recorded via Telegram bot"
}

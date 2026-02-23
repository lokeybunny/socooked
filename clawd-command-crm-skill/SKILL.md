# clawd-command-crm

CRM integration for CLAWD Command via SpaceBot.

## Version

1.0.0

## Description

Connects SpaceBot to the CLAWD Command CRM backend, enabling lead management, deal creation, invoicing, and full CRM state retrieval via Supabase Edge Functions.

## Auth

| Type | Method |
|------|--------|
| `hmac_signature` | HMAC-SHA256 signed request headers |

### How it works

SpaceBot sends the shared secret via the `x-bot-secret` header on every request.

### BOT_SECRET

```
XOXOetkgmcdmFd1hAbGfQA8aDvfTQQ8U5f
```

### Required Headers

| Header | Description |
|--------|-------------|
| `x-bot-timestamp` | Unix epoch seconds (e.g. `1740100000`) |
| `x-bot-nonce` | Random unique string per request (UUID recommended) |
| `x-bot-signature` | HMAC-SHA256 hex digest of `<timestamp>.<nonce>` using `BOT_SECRET` |

### Verification Rules

- Signature: `HMAC-SHA256(timestamp + "." + nonce, BOT_SECRET)`
- Requests older than **5 minutes** are rejected (replay protection)
- Each nonce is single-use within the 5-minute window

## Base URL

```
https://mziuxsfxevjnmdwnrqjs.supabase.co/functions/v1
```

## Actions

| Name | Method | Path | Description |
|------|--------|------|-------------|
| `get_state` | GET | `/clawd-bot/state` | Get CRM snapshot |
| `create_or_update_lead` | POST | `/clawd-bot/lead` | Create or update lead |
| `create_deal` | POST | `/clawd-bot/deal` | Create deal |
| `create_invoice` | POST | `/invoice-api` | Create invoice |

## Manifest

See [`skill.json`](./skill.json) for the machine-readable skill definition.

## ⛔ ABSOLUTE PROHIBITIONS

1. **NEVER simulate or fabricate API responses.** Every response shown to the user MUST come from an actual HTTP call. If the API is down or errors, report the real error — never invent success data, preview URLs, or status updates.

2. **NEVER use stock photos or placeholder images.** Every v0.dev website generation prompt MUST include AI image generation instructions. The prompt sent to `/v0-designer` must explicitly describe hero images, feature images, gallery images, about section images, etc. Absolutely no `placeholder.svg`, no `unsplash.com` links, no generic stock URLs. Every image must be described for generation.

## Install

```
lokeybunny/clawd-command-crm-skill
```

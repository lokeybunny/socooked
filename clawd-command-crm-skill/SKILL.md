# clawd-command-crm

CRM integration for CLAWD Command via SpaceBot.

## Version

3.3.0

## Description

Connects SpaceBot to the CLAWD Command CRM backend, enabling lead management, deal creation, invoicing, and full CRM state retrieval via Supabase Edge Functions. Includes two-phase website generation pipeline (image-generator → v0-designer).

## Auth

| Type | Method |
|------|--------|
| `shared_secret` | Plain shared secret sent as HTTP header |

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
| `create_deal` | POST | `/clawd-bot/deal` | Create deal |
| `create_invoice` | POST | `/invoice-api` | Create invoice |
| `generate_images` | POST | `/image-generator` | **Phase A: AI image generation + storage** |
| `generate_website` | POST | `/v0-designer` | **Phase B: v0 site with asset_map** |

## Two-Phase Pipeline

1. `POST /image-generator` with `{ customer_id, images: [{key, prompt}] }` → returns `asset_map`
2. `POST /v0-designer` with `{ prompt, customer_id, category, asset_map }` → returns `preview_url`

See root `SKILL.md` for full documentation and examples.

## ⛔ ABSOLUTE PROHIBITIONS

1. **NEVER simulate or fabricate API responses.**
2. **NEVER use stock photos or placeholder images.** Use the two-phase pipeline.
3. **NEVER claim images were generated unless real URLs exist.**
4. **NEVER use `import "tailwindcss"`.** Use Tailwind CDN only.

## Install

```
lokeybunny/clawd-command-crm-skill
```

# clawd-command-crm

CRM integration for CLAWD Command via SpaceBot.

## Version

1.0.0

## Description

Connects SpaceBot to the CLAWD Command CRM backend, enabling lead management, deal creation, invoicing, and full CRM state retrieval via Supabase Edge Functions.

## Auth

| Type | Header | Secret Env |
|------|--------|------------|
| `shared_secret` | `x-bot-secret` | `BOT_SECRET` |

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

## Install

```
lokeybunny/clawd-command-crm-skill
```

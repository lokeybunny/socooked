# CLAWD Command CRM — SpaceBot Skill

A SpaceBot custom skill that connects to the CLAWD CRM backend via Supabase Edge Functions.

## Installation

1. In SpaceBot, go to **Skills → Install from GitHub**
2. Paste the repository URL
3. SpaceBot will detect `spacebot/skills/clawd-command-crm/skill.json`
4. Add the `BOT_SECRET` secret in SpaceBot's skill settings
5. Done — all 4 actions are now available

## Required Secret

| Secret Name | Where to Set | Description |
|-------------|-------------|-------------|
| `BOT_SECRET` | SpaceBot → Skills → Secrets | Shared secret sent via `x-bot-secret` header to authenticate every request |

## Actions

| Action | Method | Endpoint |
|--------|--------|----------|
| `get_state` | GET | `/clawd-bot/state` |
| `create_or_update_lead` | POST | `/clawd-bot/lead` |
| `create_deal` | POST | `/clawd-bot/deal` |
| `create_invoice` | POST | `/invoice-api` |

## Quick Test

> "Get the current CRM state"

> "Create a lead named John Test with email john@test.com"

# CLAWD Command CRM — SpaceBot Skill

A SpaceBot custom skill that connects to the CLAWD CRM backend via Supabase Edge Functions.

## What It Does

Gives SpaceBot full CRM control: create leads, deals, projects, board cards, meetings, invoices, and more — all through natural language commands.

## Base URL

```
https://mziuxsfxevjnmdwnrqjs.supabase.co/functions/v1
```

## Required Secret

| Secret Name | Where to Set | Description |
|-------------|-------------|-------------|
| `BOT_SECRET` | SpaceBot → Skills → Secrets | Shared secret that authenticates every request via the `x-bot-secret` header |

## Installation

1. In SpaceBot, go to **Skills → Install from GitHub**
2. Paste this repository URL
3. SpaceBot will detect `spacebot/skills/clawd-command-crm/skill.json`
4. Add the `BOT_SECRET` secret in SpaceBot's skill settings
5. Done — all 14 actions are now available

## Quick Test Commands

Try these in SpaceBot after installing:

> "Get the current CRM state"

> "Create a lead named John Test with email john@test.com"

> "Create a deal called Website Redesign for $5000 linked to customer uuid-1234"

> "Schedule a meeting called Onboarding Call for tomorrow at 3pm"

## Available Actions

| Action | Method | Endpoint |
|--------|--------|----------|
| `get_state` | GET | `/clawd-bot/state` |
| `create_or_update_lead` | POST | `/clawd-bot/lead` |
| `create_customer` | POST | `/clawd-bot/customer` |
| `create_deal` | POST | `/clawd-bot/deal` |
| `create_project` | POST | `/clawd-bot/project` |
| `create_project_task` | POST | `/clawd-bot/project-task` |
| `create_bot_task` | POST | `/clawd-bot/bot-task` |
| `create_card` | POST | `/clawd-bot/card` |
| `move_card` | POST | `/clawd-bot/move` |
| `comment_card` | POST | `/clawd-bot/comment` |
| `attach_to_card` | POST | `/clawd-bot/attach` |
| `create_meeting` | POST | `/clawd-bot/meeting` |
| `generate_email` | POST | `/clawd-bot/generate-email` |
| `create_invoice` | POST | `/invoice-api` |

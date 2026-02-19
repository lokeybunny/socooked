# SpaceBot Skill — CLAWD Command CRM

Install in SpaceBot using:

```
owner/repo/spacebot-skill
```

Example:

```
lokeybunny/socooked/spacebot-skill
```

## Required Secret

| Secret | Where to Set | Description |
|--------|-------------|-------------|
| `BOT_SECRET` | SpaceBot → Skills → Secrets | Shared secret sent via `x-bot-secret` header |

## Actions

| Action | Method | Path |
|--------|--------|------|
| `get_state` | GET | `/clawd-bot/state` |
| `create_or_update_lead` | POST | `/clawd-bot/lead` |
| `create_deal` | POST | `/clawd-bot/deal` |
| `create_invoice` | POST | `/invoice-api` |

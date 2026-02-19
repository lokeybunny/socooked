# Install CLAWD CRM Skill into SpaceBot

## Prerequisites

- This GitHub repo must be accessible to SpaceBot (public, or SpaceBot has repo access)
- You must have the `BOT_SECRET` value that matches the one configured in your Supabase Edge Functions

## Steps

1. **Open SpaceBot** → go to **Skills**
2. Click **Install from GitHub**
3. Paste this repository URL
4. SpaceBot will auto-detect the skill at `spacebot/skills/clawd-command-crm/skill.json`
5. Go to **Skill Settings → Secrets**
6. Add a secret named `BOT_SECRET` with your shared secret value
7. Save and activate the skill

## Verify Installation

### Test 1 — Get CRM State

Ask SpaceBot:

> "Get the current CRM state"

Expected: SpaceBot calls `get_state` and returns boards, customers, deals, projects, and meetings.

### Test 2 — Create a Lead

Ask SpaceBot:

> "Create a lead named Test User with email test@example.com"

Expected: SpaceBot calls `create_or_update_lead` and returns `{ "success": true, "data": { "action": "created", "customer_id": "..." } }`.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| 401 Unauthorized | Verify `BOT_SECRET` in SpaceBot matches the one in your Edge Function secrets |
| 429 Rate Limited | Slow down — limit is 5 requests/sec per IP |
| 404 Not Found | Check that Edge Functions are deployed and the base URL is correct |

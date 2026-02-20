{
  "skill_name": "clawd-command-crm",
  "version": "1.0.0",
  "description": "CRM integration for CLAWD Command via SpaceBot",
  "auth": {
    "type": "shared_secret",
    "header": "x-bot-secret",
    "secret_env": "BOT_SECRET"
  },
  "base_url": "https://mziuxsfxevjnmdwnrqjs.supabase.co/functions/v1",
  "actions": [
    {
      "name": "get_state",
      "description": "Get CRM snapshot",
      "method": "GET",
      "path": "/clawd-bot/state"
    },
    {
      "name": "create_or_update_lead",
      "description": "Create or update lead",
      "method": "POST",
      "path": "/clawd-bot/lead"
    },
    {
      "name": "create_deal",
      "description": "Create deal",
      "method": "POST",
      "path": "/clawd-bot/deal"
    },
    {
      "name": "create_invoice",
      "description": "Create invoice",
      "method": "POST",
      "path": "/invoice-api"
    }
  ]
}

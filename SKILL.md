# clawd-command-crm

Full CRM command console for CLAWD Command via SpaceBot.

## Version

2.0.0

## Description

Connects SpaceBot to the CLAWD Command CRM backend — 45 endpoint/method combinations covering customers, leads, deals, projects, tasks, boards, cards, invoices, communications, documents, signatures, meetings, automations, content assets, interactions, and bot task management. All powered by Supabase Edge Functions.

## Auth

| Type | Algorithm |
|------|-----------|
| `hmac_signature` | HMAC-SHA256 |

### How it works

SpaceBot signs each request using the shared secret (`BOT_SECRET`) stored **only** on the server. The raw secret is **never transmitted** — only a derived signature.

### Signature Format

```
HMAC-SHA256( <timestamp>.<nonce>.<METHOD>.<path>.<body_sha256>, BOT_SECRET )
```

- `timestamp` — Unix epoch seconds
- `nonce` — UUID v4, single-use
- `METHOD` — HTTP method in UPPERCASE (e.g. `GET`, `POST`, `DELETE`, `PATCH`)
- `path` — request path (e.g. `/clawd-bot/state`)
- `body_sha256` — SHA-256 hex digest of the request body; **if body is empty, hash the empty string**

### Required Headers

| Header | Description |
|--------|-------------|
| `x-bot-timestamp` | Unix epoch seconds (e.g. `1740100000`) |
| `x-bot-nonce` | UUID v4 — unique per request |
| `x-bot-signature` | HMAC-SHA256 hex digest per signature format above |

### Verification Rules

- Requests older than **5 minutes** (300 seconds) are rejected
- Each nonce is single-use within the 5-minute window
- Invalid signatures return `401 Unauthorized`

## Base URL

```
https://mziuxsfxevjnmdwnrqjs.supabase.co/functions/v1
```

## Response Schema

All endpoints return:

```json
{ "success": true, "data": { ... }, "api_version": "v1" }
```

On error:

```json
{ "success": false, "error": "...", "api_version": "v1" }
```

## Actions (Production)

| # | Action Name | Method | Path | Summary |
|---|-------------|--------|------|---------|
| 1 | `crm_state_get` | GET | `/clawd-bot/state` | Full CRM snapshot |
| 2 | `crm_customers_list` | GET | `/clawd-bot/customers` | List customers |
| 3 | `crm_customer_upsert` | POST | `/clawd-bot/customer` | Create or update customer |
| 4 | `crm_customer_delete` | DELETE | `/clawd-bot/customer` | Delete customer |
| 5 | `crm_lead_upsert` | POST | `/clawd-bot/lead` | Create/update lead (dedup by email) |
| 6 | `crm_deals_list` | GET | `/clawd-bot/deals` | List deals |
| 7 | `crm_deal_upsert` | POST | `/clawd-bot/deal` | Create or update deal |
| 8 | `crm_deal_delete` | DELETE | `/clawd-bot/deal` | Delete deal |
| 9 | `crm_projects_list` | GET | `/clawd-bot/projects` | List projects |
| 10 | `crm_project_upsert` | POST | `/clawd-bot/project` | Create or update project |
| 11 | `crm_project_delete` | DELETE | `/clawd-bot/project` | Delete project |
| 12 | `crm_project_tasks_list` | GET | `/clawd-bot/project-tasks` | List project tasks |
| 13 | `crm_project_task_upsert` | POST | `/clawd-bot/project-task` | Create or update project task |
| 14 | `crm_project_task_delete` | DELETE | `/clawd-bot/project-task` | Delete project task |
| 15 | `crm_content_list` | GET | `/clawd-bot/content` | List content assets |
| 16 | `crm_content_upsert` | POST | `/clawd-bot/content` | Create or update content asset |
| 17 | `crm_content_delete` | DELETE | `/clawd-bot/content` | Delete content asset |
| 18 | `crm_threads_list` | GET | `/clawd-bot/threads` | List conversation threads |
| 19 | `crm_thread_upsert` | POST | `/clawd-bot/thread` | Create or update thread |
| 20 | `crm_thread_delete` | DELETE | `/clawd-bot/thread` | Delete thread |
| 21 | `crm_documents_list` | GET | `/clawd-bot/documents` | List documents |
| 22 | `crm_document_upsert` | POST | `/clawd-bot/document` | Create or update document |
| 23 | `crm_document_delete` | DELETE | `/clawd-bot/document` | Delete document |
| 24 | `crm_invoices_list` | GET | `/clawd-bot/invoices` | List invoices |
| 25 | `crm_invoice_upsert` | POST | `/clawd-bot/invoice` | Create or update invoice |
| 26 | `crm_invoice_delete` | DELETE | `/clawd-bot/invoice` | Delete invoice |
| 27 | `crm_invoice_api_create` | POST | `/invoice-api` | Create invoice with line items + auto-calc |
| 28 | `crm_invoice_api_list` | GET | `/invoice-api` | List invoices (dedicated API) |
| 29 | `crm_invoice_api_update` | PATCH | `/invoice-api` | Update invoice status |
| 30 | `crm_communications_list` | GET | `/clawd-bot/communications` | List communications |
| 31 | `crm_communication_upsert` | POST | `/clawd-bot/communication` | Create or update communication |
| 32 | `crm_communication_delete` | DELETE | `/clawd-bot/communication` | Delete communication |
| 33 | `crm_signatures_list` | GET | `/clawd-bot/signatures` | List signatures (read-only) |
| 34 | `crm_interactions_list` | GET | `/clawd-bot/interactions` | List interactions |
| 35 | `crm_interaction_create` | POST | `/clawd-bot/interaction` | Log customer interaction |
| 36 | `crm_boards_list` | GET | `/clawd-bot/boards` | List boards with lists + cards |
| 37 | `crm_board_upsert` | POST | `/clawd-bot/board` | Create or update board |
| 38 | `crm_board_delete` | DELETE | `/clawd-bot/board` | Delete board |
| 39 | `crm_list_create` | POST | `/clawd-bot/list` | Create list on a board |
| 40 | `crm_card_upsert` | POST | `/clawd-bot/card` | Create or update card |
| 41 | `crm_card_delete` | DELETE | `/clawd-bot/card` | Delete card |
| 42 | `crm_card_move` | POST | `/clawd-bot/move` | Move card to different list |
| 43 | `crm_card_comment` | POST | `/clawd-bot/comment` | Add comment to card |
| 44 | `crm_card_attach` | POST | `/clawd-bot/attach` | Attach URL/file to card |
| 45 | `crm_bot_tasks_list` | GET | `/clawd-bot/bot-tasks` | List bot tasks |
| 46 | `crm_bot_task_upsert` | POST | `/clawd-bot/bot-task` | Create or update bot task |
| 47 | `crm_bot_task_delete` | DELETE | `/clawd-bot/bot-task` | Delete bot task |
| 48 | `crm_activity_list` | GET | `/clawd-bot/activity` | Activity log (read-only) |
| 49 | `crm_labels_list` | GET | `/clawd-bot/labels` | List labels |
| 50 | `crm_label_create` | POST | `/clawd-bot/label` | Create label on board |
| 51 | `crm_automations_list` | GET | `/clawd-bot/automations` | List automations |
| 52 | `crm_automation_upsert` | POST | `/clawd-bot/automation` | Create or update automation |
| 53 | `crm_automation_delete` | DELETE | `/clawd-bot/automation` | Delete automation |
| 54 | `crm_meetings_list` | GET | `/clawd-bot/meetings` | List meetings |
| 55 | `crm_meeting_upsert` | POST | `/clawd-bot/meeting` | Create or update meeting |
| 56 | `crm_meeting_delete` | DELETE | `/clawd-bot/meeting` | Delete meeting |
| 57 | `crm_email_generate` | POST | `/clawd-bot/generate-email` | Generate portal invitation email |

## Internal / Disabled Actions

These are included in `skill.json` with `"internal": true, "enabled": false`. They are **not** available to SpaceBot by default.

| Action Name | Method | Path | Notes |
|-------------|--------|------|-------|
| `crm_task_autocard` | POST | `/clawd-bot/task` | Auto-card creator (internal) |
| `crm_automation_trigger` | POST | `/clawd-bot/trigger` | Execute automation rules (internal) |
| `crm_generate_resume` | POST | `/clawd-bot/generate-resume` | Mock PDF generation |
| `crm_generate_contract` | POST | `/clawd-bot/generate-contract` | Mock PDF generation |
| `crm_analyze_thread` | POST | `/clawd-bot/analyze-thread` | Mock thread analysis |

## Manifest

See [`spacebot-skill/skill.json`](./spacebot-skill/skill.json) for the machine-readable skill definition.

## Install

```
lokeybunny/clawd-command-crm-skill
```

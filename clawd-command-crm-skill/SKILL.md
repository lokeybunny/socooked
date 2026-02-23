# clawd-command-crm

CRM integration for CLAWD Command via SpaceBot.

## Version

3.3.2

## Description

Connects SpaceBot to the CLAWD Command CRM backend. Website generation uses v0.dev's internal AI image generation via design-intent prompt crafting. All prompts are enforced to use design-intent-only language — no "generate" commands, no placeholders, no stock URLs.

## Auth

| Header | Value |
|--------|-------|
| `x-bot-secret` | `XOXOetkgmcdmFd1hAbGfQA8aDvfTQQ8U5f` |

## Base URL

```
https://mziuxsfxevjnmdwnrqjs.supabase.co/functions/v1
```

## v0 Image Strategy (v3.3.2)

The `/v0-designer` gateway and the Internal Prompting Machine (`/prompt-machine`) enforce **design-intent-only language** so v0 uses its own built-in AI image generation. No external image generator needed.

**✅ Use design-intent:** "The hero features a cinematic barbershop interior with warm Edison bulb lighting, smiling clients in leather barber chairs"
**❌ Don't use commands:** "Generate an image of a barbershop" / "MANDATORY AI GENERATE"

**Mandatory closing directive:** Every prompt MUST end with:
> Replace all image placeholders with real people smiling within this niche.

See root `SKILL.md` for full documentation and examples.

## 🚨 INSTANT LINK DELIVERY + AUTO-POLLING (v3.3.2)

### Required Flow
```
User request → POST /v0-designer → Instant edit_url → (auto-poll every 30s) → notify with preview_url
```

### ✅ Required Output Format
```
✅ Website started for [Name]!

🔴 Watch live: https://v0.app/chat/[CHAT_ID]

⏱️ Status: generating
💬 Chat ID: [CHAT_ID]

The AI is generating your site in real-time.

I'll message you when the final preview URL is ready!
```

### 🔄 MANDATORY AUTO-POLLING

After initial link delivery, agent MUST auto-poll `GET /clawd-bot/previews` every 30 seconds:
- **0:00** — Deliver link immediately
- **Every 30s** — Silent check (no message)
- **Every 2 min** — Send elapsed time update: `"⏳ 2:00 elapsed... Still generating..."`
- **On completion** — Send `"✅ READY! [preview_url]"` immediately
- **10 min timeout** — Send timeout notice

**The user must NEVER ask "update?" or "status?" — polling is automatic.**

### ❌ BANNED Patterns (zero tolerance)
- `⏳ Creating [Name]...` — FORBIDDEN
- `Step 1` / `Step 2` progress — FORBIDDEN
- Multi-step narration — FORBIDDEN
- Delaying link delivery — FORBIDDEN
- Waiting for user to ask "update?" — FORBIDDEN
- Stopping polling after initial message — FORBIDDEN

## ⛔ ABSOLUTE PROHIBITIONS

1. **NEVER simulate or fabricate API responses.**
2. **NEVER use placeholder.svg, unsplash, pexels, or stock photos.**
3. **NEVER use `import "tailwindcss"`.** Tailwind CDN only.
4. **NEVER use "generate an image" or "MANDATORY AI GENERATE" language** — use design-intent descriptions only.
5. **NEVER omit the closing directive** — every prompt must end with the smiling people replacement line.
6. **NEVER show multi-step progress to the user.** Single call, instant link.
7. **NEVER delay delivering the `edit_url`.** Return it the moment the API responds.

## Install

```
lokeybunny/clawd-command-crm-skill
```

# clawd-command-crm

CRM integration for CLAWD Command via SpaceBot.

## Version

3.3.1

## Description

Connects SpaceBot to the CLAWD Command CRM backend. Website generation uses v0.dev's internal AI image generation via design-intent prompt crafting.

## Auth

| Header | Value |
|--------|-------|
| `x-bot-secret` | `XOXOetkgmcdmFd1hAbGfQA8aDvfTQQ8U5f` |

## Base URL

```
https://mziuxsfxevjnmdwnrqjs.supabase.co/functions/v1
```

## v0 Image Strategy

The `/v0-designer` gateway auto-enriches prompts with **design-intent language** so v0 uses its own built-in AI image generation. No external image generator needed.

**✅ Use design-intent:** "The hero features a cinematic barbershop interior with warm Edison bulb lighting"
**❌ Don't use commands:** "Generate an image of a barbershop"

See root `SKILL.md` for full documentation and examples.

## ⛔ ABSOLUTE PROHIBITIONS

1. **NEVER simulate or fabricate API responses.**
2. **NEVER use placeholder.svg, unsplash, pexels, or stock photos.**
3. **NEVER use `import "tailwindcss"`.** Tailwind CDN only.
4. **NEVER use "generate an image" language** — use design-intent descriptions.

## Install

```
lokeybunny/clawd-command-crm-skill
```

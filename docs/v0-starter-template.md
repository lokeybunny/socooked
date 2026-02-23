# V0 Starter Template — CRM-Controlled Sites

> **Version:** 1.0.0  
> **Last Updated:** 2026-02-23

## Overview

Every v0 site generated through CLAWD Command should include a **config-fetching hook** that pulls editable content from the CRM API at runtime. This means "editing" a site = updating data in the CRM — **no v0 login, no redeployment needed**.

---

## How It Works

```
┌─────────────┐     POST /site-config      ┌──────────────┐
│  SpaceBot   │ ─────────────────────────▶  │   Database    │
│  (Cortex)   │                             │ site_configs  │
└─────────────┘                             └──────┬───────┘
                                                   │
                    GET /site-configs?site_id=xxx   │
┌─────────────┐ ◀──────────────────────────────────┘
│  V0 Site    │  (fetches on page load)
│  (Browser)  │
└─────────────┘
```

---

## V0 Prompt Template

When generating a new client site with v0, **always include this instruction** at the end of the prompt:

```
IMPORTANT: This site must use a dynamic content system. Add this to the project:

1. Create a hook called useSiteConfig that fetches content from:
   GET https://mziuxsfxevjnmdwnrqjs.supabase.co/functions/v1/clawd-bot/site-configs?site_id=SITE_ID_HERE&published=true
   
   Headers: { "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16aXV4c2Z4ZXZqbm1kd25ycWpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNjgzMzQsImV4cCI6MjA4Njc0NDMzNH0.APi_x5YBKa8bOKpjLGiJUBB5qxi3rKKxWiApQAlf78c" }

2. The hook should return a config object keyed by section name (hero, about, services, gallery, contact, footer).

3. Each section component should read from the config and fall back to hardcoded defaults if the API is unreachable.

4. Sections that support dynamic content:
   - hero: { headline, subheadline, image_url, cta_text, cta_url }
   - about: { title, body, image_url }
   - services: { title, items: [{ name, description, price, image_url }] }
   - gallery: { title, images: [{ url, alt, caption }] }
   - contact: { phone, email, address, hours, map_embed_url }
   - footer: { business_name, tagline, social_links: { instagram, facebook, tiktok } }
   - meta: { page_title, description, favicon_url, og_image_url }
```

---

## API Endpoints

### Read all sections for a site

```
GET /clawd-bot/site-configs?site_id=terrion-barber&published=true
```

Response:
```json
{
  "success": true,
  "data": {
    "site_id": "terrion-barber",
    "config": {
      "hero": { "headline": "Precision Cuts", "image_url": "https://...", "_version": 3 },
      "services": { "items": [...], "_version": 1 }
    }
  }
}
```

### Create or update a section

```
POST /clawd-bot/site-config
{
  "site_id": "terrion-barber",
  "section": "hero",
  "content": {
    "headline": "Precision Cuts & Fades",
    "subheadline": "Atlanta's Premier Barbershop",
    "image_url": "https://example.com/hero.jpg",
    "cta_text": "Book Now",
    "cta_url": "https://calendly.com/terrion"
  },
  "customer_id": "uuid-optional"
}
```

Auto-increments version. Defaults to `is_published: true`.

### Delete a section

```
DELETE /clawd-bot/site-config
{ "site_id": "terrion-barber", "section": "hero" }
```

---

## SpaceBot / Cortex Commands

### Update hero image
```
POST /clawd-bot/site-config
{
  "site_id": "terrion-barber",
  "section": "hero",
  "content": {
    "headline": "Precision Cuts & Fades",
    "image_url": "https://new-image-url.com/barber.jpg"
  }
}
```

### Update services & pricing
```
POST /clawd-bot/site-config
{
  "site_id": "terrion-barber",
  "section": "services",
  "content": {
    "title": "Our Services",
    "items": [
      { "name": "Precision Fade", "price": "$35", "description": "Clean, sharp fade tailored to your style" },
      { "name": "Lineup", "price": "$20", "description": "Edge up and shape" },
      { "name": "Beard Grooming", "price": "$25", "description": "Trim, shape, and condition" }
    ]
  }
}
```

### Update contact info
```
POST /clawd-bot/site-config
{
  "site_id": "terrion-barber",
  "section": "contact",
  "content": {
    "phone": "+1-404-555-0100",
    "email": "terrion@barber.com",
    "address": "123 Peachtree St, Atlanta, GA",
    "hours": "Mon-Sat 9am-7pm, Sun Closed"
  }
}
```

---

## Naming Convention

`site_id` should be a kebab-case slug: `{client-name}-{business-type}`

Examples:
- `terrion-barber`
- `jane-doe-photography`
- `atlanta-fitness-studio`

---

## Workflow

1. **Generate site** → `POST /clawd-bot/generate-website` with v0 prompt including the config hook
2. **Seed config** → Multiple `POST /clawd-bot/site-config` calls to populate initial content
3. **Client requests change** → SpaceBot updates the relevant section via `POST /clawd-bot/site-config`
4. **Site auto-reflects** → Next page load pulls fresh config — no deploy needed

---

*Version: 1.0.0 — Last updated: 2026-02-23*

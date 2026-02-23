# clawd-command-crm

CRM integration for CLAWD Command via SpaceBot.

## Version

3.3.0

## Description

Connects SpaceBot to the CLAWD Command CRM backend, enabling lead management, deal creation, invoicing, meetings, web design generation (two-phase pipeline), headless CMS site configs, and full CRM state retrieval via Supabase Edge Functions.

## Auth

| Type | Method |
|------|--------|
| `shared_secret` | Plain shared secret sent as HTTP header |

### How it works

Send the shared secret as the `x-bot-secret` header on **every** request. No HMAC signing, no timestamps, no nonces — just the raw secret value.

### Required Header

| Header | Value |
|--------|-------|
| `x-bot-secret` | `XOXOetkgmcdmFd1hAbGfQA8aDvfTQQ8U5f` |

## Base URL

```
https://mziuxsfxevjnmdwnrqjs.supabase.co/functions/v1
```

## Actions

| Name | Method | Path | Description |
|------|--------|------|-------------|
| `get_state` | GET | `/clawd-bot/state` | Get CRM snapshot |
| `create_or_update_lead` | POST | `/clawd-bot/lead` | Create or update lead |
| `create_or_update_customer` | POST | `/clawd-bot/customer` | Create or update customer (include `id` to update) |
| `delete_customer` | DELETE | `/clawd-bot/customer` | Delete customer by `id` in body `{"id":"uuid"}` |
| `create_deal` | POST | `/clawd-bot/deal` | Create deal |
| `create_invoice` | POST | `/invoice-api` | Create invoice |
| `create_meeting` | POST | `/clawd-bot/meeting` | Create a meeting room (returns `room_code` + `room_url`) |
| `create_card` | POST | `/clawd-bot/card` | Create a board card |
| `generate_images` | POST | `/image-generator` | **Phase A: Generate images + store to Supabase Storage** |
| `generate_website` | POST | `/v0-designer` | **Phase B: Generate v0 website with asset_map (DIRECT — preferred)** |
| `generate_website_legacy` | POST | `/clawd-bot/generate-website` | Legacy proxy (still works) |
| `edit_site_content` | POST | `/clawd-bot/site-config` | **Edit site content via Headless CMS (preferred for edits)** |
| `structural_edit` | POST | `/v0-designer` | Structural v0 edit (requires `chat_id` in body) |
| `publish_website` | POST | `/clawd-bot/publish-website` | Deploy v0 site to Vercel (requires Vercel linking) |
| `get_site_configs` | GET | `/clawd-bot/site-configs?site_id=slug` | Read site content (PUBLIC — no auth needed) |
| `upsert_site_config` | POST | `/clawd-bot/site-config` | Create/update a site content section |
| `delete_site_config` | DELETE | `/clawd-bot/site-config` | Delete a site content section |
| `list_previews` | GET | `/clawd-bot/previews` | List API-generated work |

---

## Two-Phase Website Generation: Images then v0 (v3.3.0)

### WHY this exists

v0.dev previews frequently render with broken images, all-black pages, or placeholder artifacts because v0 generates code that *references* images but does not *produce* real image files. The generated `<img>` tags point to non-existent URLs, placeholder.svg, or unsplash/pexels links that may be blocked or render incorrectly.

**The solution:** Generate real images FIRST, upload them to permanent storage, then pass those real URLs into the v0 prompt so the rendered preview contains actual working images.

### Strict Rules

1. **No fabricated `preview_url`** — every preview_url shown to the user MUST come from a real v0 API response
2. **No fabricated image URLs** — every image URL must be a real Supabase Storage public URL from an actual upload
3. **No `placeholder.svg`** — never reference placeholder.svg in any prompt or output
4. **No `unsplash.com` / `pexels.com` / stock-photo language** — all images must be AI-generated and stored
5. **Tailwind CDN only** — v0 prompts must use `<script src="https://cdn.tailwindcss.com"></script>`, never `import "tailwindcss"` or npm imports

### Agent Behavior (Exact Sequence)

```
1. PRODUCE image prompt list
   → Analyze the website request
   → Generate a list of {key, prompt} for each visual section:
     hero_image, feature_1, feature_2, feature_3, about_image, gallery_1...gallery_6

2. CALL image generation endpoint
   → POST /image-generator
   → Body: { customer_id, images: [{key, prompt}, ...] }

3. RECEIVE asset_map
   → { asset_map: { hero_image: "https://...png", feature_1: "https://...png", ... } }

4. CALL /v0-designer with asset_map
   → POST /v0-designer
   → Body: { prompt, customer_id, category, asset_map }
   → The function auto-injects asset URLs into the v0 prompt

5. RETURN to user
   → preview_url (real, from v0 API)
   → asset_map (real URLs)
   → section summary
```

### Fallback Behavior

If image generation FAILS (partial or total):
- Still generate the site via `/v0-designer` but WITHOUT fake image URLs
- Use CSS gradients, solid colors, and icons instead of images
- Clearly state: **"IMAGES NOT GENERATED — site uses gradient/icon placeholders"**
- Include the `errors` array from the image-generator response
- NEVER insert fabricated image URLs

If v0 generation FAILS:
- Return the exact v0 prompt that was sent (for debugging)
- Return the asset_map (images are still valid)
- Return the raw error from v0
- NEVER fabricate a preview_url

### Example: Image Generator Request

```json
POST /image-generator
Headers: { "x-bot-secret": "...", "Content-Type": "application/json" }

{
  "customer_id": "abc-123-def",
  "images": [
    { "key": "hero_image", "prompt": "A dramatic wide-angle shot of a modern barbershop interior with warm Edison bulb lighting, leather chairs, and exposed brick walls" },
    { "key": "services_1", "prompt": "Close-up of a barber performing a precise fade haircut, professional lighting, shallow depth of field" },
    { "key": "services_2", "prompt": "Hot towel shave in progress at a luxury barbershop, steam visible, warm tones" },
    { "key": "about_image", "prompt": "Professional portrait of a barbershop team standing confidently in their shop, arms crossed, warm lighting" },
    { "key": "gallery_1", "prompt": "Before and after of a clean taper fade haircut, studio lighting" },
    { "key": "gallery_2", "prompt": "Styled pompadour haircut from the side angle, product in hair, professional photography" }
  ]
}
```

### Example: Image Generator Response

```json
{
  "success": true,
  "asset_map": {
    "hero_image": "https://mziuxsfxevjnmdwnrqjs.supabase.co/storage/v1/object/public/site-assets/abc-123-def/1708900000000/hero-image.png",
    "services_1": "https://mziuxsfxevjnmdwnrqjs.supabase.co/storage/v1/object/public/site-assets/abc-123-def/1708900000000/services-1.png",
    "services_2": "https://mziuxsfxevjnmdwnrqjs.supabase.co/storage/v1/object/public/site-assets/abc-123-def/1708900000000/services-2.png",
    "about_image": "https://mziuxsfxevjnmdwnrqjs.supabase.co/storage/v1/object/public/site-assets/abc-123-def/1708900000000/about-image.png",
    "gallery_1": "https://mziuxsfxevjnmdwnrqjs.supabase.co/storage/v1/object/public/site-assets/abc-123-def/1708900000000/gallery-1.png",
    "gallery_2": "https://mziuxsfxevjnmdwnrqjs.supabase.co/storage/v1/object/public/site-assets/abc-123-def/1708900000000/gallery-2.png"
  },
  "raw": [
    { "key": "hero_image", "status": "success" },
    { "key": "services_1", "status": "success" },
    { "key": "services_2", "status": "success" },
    { "key": "about_image", "status": "success" },
    { "key": "gallery_1", "status": "success" },
    { "key": "gallery_2", "status": "success" }
  ],
  "images_generated": 6,
  "images_failed": 0
}
```

### Example: v0-designer Request with asset_map

```json
POST /v0-designer
Headers: { "x-bot-secret": "...", "Content-Type": "application/json" }

{
  "prompt": "Build a modern barbershop website for 'Elite Cuts'. Dark theme with gold accents. Sections: hero with booking CTA, services grid (3 services), about the team, gallery (6 images), contact with map. Use the provided asset images for all visual sections.",
  "customer_id": "abc-123-def",
  "category": "brick-and-mortar",
  "asset_map": {
    "hero_image": "https://mziuxsfxevjnmdwnrqjs.supabase.co/storage/v1/object/public/site-assets/abc-123-def/1708900000000/hero-image.png",
    "services_1": "https://mziuxsfxevjnmdwnrqjs.supabase.co/storage/v1/object/public/site-assets/abc-123-def/1708900000000/services-1.png",
    "services_2": "https://mziuxsfxevjnmdwnrqjs.supabase.co/storage/v1/object/public/site-assets/abc-123-def/1708900000000/services-2.png",
    "about_image": "https://mziuxsfxevjnmdwnrqjs.supabase.co/storage/v1/object/public/site-assets/abc-123-def/1708900000000/about-image.png",
    "gallery_1": "https://mziuxsfxevjnmdwnrqjs.supabase.co/storage/v1/object/public/site-assets/abc-123-def/1708900000000/gallery-1.png",
    "gallery_2": "https://mziuxsfxevjnmdwnrqjs.supabase.co/storage/v1/object/public/site-assets/abc-123-def/1708900000000/gallery-2.png"
  }
}
```

---

## Web Design Workflow (v3.3.0)

### ⚠️ MANDATORY: Two-phase pipeline for ALL new website generation

SpaceBot MUST follow the two-phase pipeline:
1. **Phase A:** `POST /image-generator` → generate + store real images
2. **Phase B:** `POST /v0-designer` with `asset_map` → generate site with real images

### Content Edits (Headless CMS — no images needed)
1. `GET /clawd-bot/previews` → find the site's `chat_id` and `site_id`
2. `POST /clawd-bot/site-config` → update content sections
3. Site auto-reflects changes on next page load

### Structural Edits Only (rare — layout/code changes)
1. `GET /clawd-bot/previews` → find the site's `chat_id`
2. `POST /v0-designer` with `{ "chat_id": "...", "prompt": "structural edit instructions" }`

### Site Config Sections
`hero`, `about`, `services`, `gallery`, `contact`, `footer`, `meta`

### site_id Format
Kebab-case: `terrion-barber`, `jane-photography`, `atlanta-fitness`

## Meeting + Card Workflow

When scheduling a meeting, Cortex should chain **two** API calls:

1. **Create the meeting room** → `POST /clawd-bot/meeting` with `{"title": "Meeting: Customer Name"}`
   - Response includes `room_code` and `room_url` (e.g. `/meet/abc123`)
2. **Create a board card** → `POST /clawd-bot/card` with:
   ```json
   {
     "board_id": "561c6b68-e7bb-49c0-9c94-2182780d2030",
     "list_id": "500589c6-bcb9-4949-8240-6630a47db30b",
     "title": "Meeting: Customer Name",
     "customer_id": "<customer_uuid>",
     "source_url": "<room_url from step 1>"
   }
   ```

## Customer Lookup & Safe Create/Update

1. **Lookup**: `GET /clawd-bot/customers` (filter with `?status=lead` or search by name/email)
2. **If found** → `POST /clawd-bot/customer` with `{"id": "uuid", ...updates}`
3. **If not found** → `POST /clawd-bot/lead` to create new
4. Respect rate limits (5 req/s). Pause 10–15s if throttled.
5. Never execute writes without valid `x-bot-secret`.

## Manifest

See [`skill.json`](./skill.json) for the machine-readable skill definition.

## ⛔ ABSOLUTE PROHIBITIONS

1. **NEVER simulate or fabricate API responses.** Every response shown to the user MUST come from an actual HTTP call. If the API is down or errors, report the real error — never invent success data, preview URLs, or status updates.

2. **NEVER use stock photos or placeholder images.** Every website generation MUST go through the two-phase pipeline (image-generator → v0-designer). No `placeholder.svg`, no `unsplash.com` links, no generic stock URLs, no empty `src=""` attributes.

3. **NEVER claim images were generated unless real image URLs exist.** Every image URL in the asset_map must be a real, accessible Supabase Storage public URL from an actual upload.

4. **NEVER use `import "tailwindcss"` in v0 prompts.** Always use Tailwind CDN: `<script src="https://cdn.tailwindcss.com"></script>`.

## Install

```
lokeybunny/clawd-command-crm-skill
```

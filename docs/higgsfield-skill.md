# Higgsfield AI — Cortex Skill Reference

## Overview
Higgsfield AI is a unified generative media platform. Through the CRM's `higgsfield-api` edge function, Cortex can generate **images** (text-to-image) and **videos** (image-to-video) for any customer. Results are automatically stored in the Content Library under **AI Generated**.

## API Reference
- **Base URL:** `https://platform.higgsfield.ai`
- **Auth:** `Authorization: Key {HIGGSFIELD_API_KEY}:{HIGGSFIELD_CLIENT_SECRET}`
- **Pattern:** Async queue — submit → poll → retrieve
- **Statuses:** `queued` → `in_progress` → `completed` | `failed` | `nsfw`
- **Cancel:** Only while `queued` (returns `202` on success, `400` if already processing)

---

## Available CRM Actions

### 1. Generate Content
**Action:** `crm_higgsfield_generate`  
**Method:** `POST`  
**Path:** `/clawd-bot/generate-content`

**Body:**
```json
{
  "prompt": "A futuristic storefront with neon signs at dusk",
  "type": "image",
  "customer_id": "uuid",
  "customer_name": "John Doe",
  "model": "higgsfield-ai/soul/standard",
  "aspect_ratio": "16:9",
  "resolution": "720p"
}
```

**For video (image-to-video):**
```json
{
  "prompt": "Animate the scene with flowing motion and cinematic lighting",
  "type": "video",
  "customer_id": "uuid",
  "customer_name": "Jane Smith",
  "image_url": "https://example.com/source-image.jpg",
  "model": "higgsfield-ai/dop/standard",
  "duration": 5
}
```

**Parameters:**
| Field | Required | Description |
|-------|----------|-------------|
| `prompt` | ✅ | Descriptive text for generation. Use design-intent language. |
| `type` | ❌ | `"image"` or `"video"`. Auto-detected if `image_url` is provided. |
| `customer_id` | ❌ | UUID of the customer this content is for. |
| `customer_name` | ❌ | Customer name for labeling the output. |
| `model` | ❌ | Model ID. Defaults: `higgsfield-ai/soul/standard` (image), `higgsfield-ai/dop/standard` (video). |
| `aspect_ratio` | ❌ | Image aspect ratio. Default: `"16:9"`. Options: `"1:1"`, `"4:3"`, `"16:9"`, `"9:16"`. |
| `resolution` | ❌ | Image resolution. Default: `"720p"`. Options: `"480p"`, `"720p"`, `"1080p"`. |
| `image_url` | ❌ | Source image URL for video generation (image-to-video). |
| `duration` | ❌ | Video duration in seconds. Default: `5`. |

**Response:**
```json
{
  "success": true,
  "data": {
    "request_id": "d7e6c0f3-6699-4f6c-bb45-2ad7fd9158ff",
    "bot_task_id": "uuid",
    "status": "queued",
    "status_url": "https://platform.higgsfield.ai/requests/.../status",
    "type": "image"
  }
}
```

---

### 2. Poll Status
**Action:** `crm_higgsfield_poll`  
**Method:** `POST`  
**Path:** `/clawd-bot/poll-content`

**Body:**
```json
{
  "request_id": "req_abc123",
  "bot_task_id": "uuid"
}
```

**Response (completed):**
```json
{
  "success": true,
  "data": {
    "status": "completed",
    "output_url": "https://cdn.higgsfield.ai/...",
    "output_type": "image",
    "content_asset_id": "uuid",
    "title": "John Doe — Image — Feb 24, 2026 3:15 PM"
  }
}
```

**Status values:** `queued`, `in_progress`, `completed`, `failed`, `nsfw`

---

### 3. Cancel Generation
**Action:** `crm_higgsfield_cancel`  
**Method:** `POST`  
**Path:** `/clawd-bot/cancel-content`

**Body:**
```json
{
  "request_id": "req_abc123",
  "bot_task_id": "uuid"
}
```

---

## Available Models

### Image Models (text-to-image)
| Model ID | Description |
|----------|-------------|
| `higgsfield-ai/soul/standard` | **Soul Standard** — High-quality creative images (default) |
| `higgsfield-ai/soul/turbo` | **Soul Turbo** — Faster generation, slightly lower quality |
| `flux` | **FLUX** — Photorealistic image generation |

### Video Models (image-to-video)
| Model ID | Description |
|----------|-------------|
| `higgsfield-ai/dop/standard` | **DOP Standard** — Cinematic image-to-video animation (default) |
| `higgsfield-ai/dop/turbo` | **DOP Turbo** — Faster video generation |

---

## Prompt Engineering Guide

### Image Prompts (Design-Intent)
Write prompts as **scene descriptions**, not commands:

✅ **Good:** "A modern barbershop interior with warm amber lighting, leather chairs, exposed brick walls, and a vintage neon 'OPEN' sign glowing in the window"

❌ **Bad:** "Generate an image of a barbershop"

### Tips:
- Include **lighting** (golden hour, neon, studio, ambient)
- Include **mood** (cinematic, vibrant, moody, clean)
- Include **composition** (close-up, wide angle, bird's eye, centered)
- Include **style** (photorealistic, editorial, minimalist, retro)
- Include **materials/textures** (marble, wood, glass, metal)

### Video Prompts (Motion-Intent)
Describe the **motion and camera movement**:

✅ **Good:** "Slow dolly forward through the storefront entrance, camera rises slightly to reveal the full interior, gentle ambient movement on hanging lights"

❌ **Bad:** "Make this image into a video"

### Customer-Specific Prompts
When generating for a customer, always:
1. Reference their **business category** for context
2. Use their **brand colors** if known
3. Match the **industry aesthetic** (food → warm tones, tech → clean/minimal)

---

## Workflow: Generate → Poll → Store

```
1. User requests: "Create a promotional image for [Customer]"
2. Cortex calls: POST /clawd-bot/generate-content
   → Creates bot_task (content-manager)
   → Submits to Higgsfield API
   → Returns request_id
   
3. Auto-poll (or manual): POST /clawd-bot/poll-content
   → Checks Higgsfield status
   → On completion:
     a. Downloads output URL
     b. Creates content_asset (source: 'higgsfield')
     c. Labels: "{Customer} — {Type} — {Date} {Time}"
     d. Folder: "AI Generated/{Customer}"
     e. Updates bot_task to 'done'
     f. Logs activity (triggers Telegram notification)
```

---

## Telegram Notifications
All Higgsfield activity automatically triggers Telegram notifications via the activity log:
- 🎨 **Image queued** — when generation starts
- 🎬 **Video queued** — when video generation starts
- ✅ **Image/Video completed** — when output is ready
- ❌ **Failed/NSFW** — when generation fails

---

## Error Handling
| Status | Meaning | Action |
|--------|---------|--------|
| `400` | Bad request / missing prompt | Fix the request body |
| `401` | Unauthorized | Check API key |
| `429` | Rate limited | Wait and retry with backoff |
| `502` | Higgsfield API error | Check Higgsfield status page |
| `nsfw` | Content flagged | Modify prompt to be appropriate |

---

## Example Cortex Conversations

**User:** "Create a hero banner for Sunrise Bakery"
**Cortex:** Calls `crm_higgsfield_generate` with:
```json
{
  "prompt": "A warm, inviting bakery storefront at sunrise with golden light streaming through large windows, artisan bread and pastries visible on display, rustic wood and marble surfaces, soft morning atmosphere",
  "type": "image",
  "customer_name": "Sunrise Bakery",
  "aspect_ratio": "16:9",
  "resolution": "1080p"
}
```

**User:** "Turn that image into a video"
**Cortex:** Calls `crm_higgsfield_generate` with:
```json
{
  "prompt": "Gentle camera push through the bakery window, steam rising from fresh bread, warm light particles floating in the golden morning air, subtle movement on hanging pendant lights",
  "type": "video",
  "image_url": "<output_url from previous generation>",
  "customer_name": "Sunrise Bakery",
  "duration": 5
}
```

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

/**
 * SMM Media Generator
 * - Images: Lovable AI (Nano Banana / gemini-2.5-flash-image)
 * - Videos: Higgsfield API (submit + poll loop)
 *
 * Generates media for the next 2 calendar days by default.
 * Accepts optional `force_dates` and `plan_id`.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
const HIGGSFIELD_API_KEY = Deno.env.get('HIGGSFIELD_API_KEY');
const HIGGSFIELD_CLIENT_SECRET = Deno.env.get('HIGGSFIELD_CLIENT_SECRET');

async function logActivity(action: string, meta: Record<string, any>) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/activity_log`, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_ROLE_KEY, 'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json', 'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ entity_type: 'smm', action, meta }),
    });
  } catch (e) { console.error('[smm-media-gen] log error:', e); }
}

/** Post a status message to the Cortex SMM Strategist chat panel via smm_conversations */
async function cortexStatus(profileUsername: string, platform: string, message: string) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/smm_conversations`, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_ROLE_KEY, 'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json', 'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        profile_username: profileUsername,
        platform,
        source: 'system',
        role: 'cortex',
        message,
        meta: { type: 'media_gen_status' },
      }),
    });
  } catch (e) { console.error('[smm-media-gen] cortex status error:', e); }
}

/* ────── PROMPT VARIATION — AI-powered creative rewrite ────── */
async function varyPrompt(
  originalPrompt: string,
  mediaType: string,
  brandContext: { niche?: string; voice?: string; audience?: string; keywords?: string[] },
  caption: string,
): Promise<string> {
  if (!LOVABLE_API_KEY) return originalPrompt;

  try {
    console.log('[smm-media-gen] Generating varied prompt via AI…');
    const systemMsg = `You are a creative director for social media visuals. Given an original image/video prompt and brand context, write a COMPLETELY NEW visual prompt that:
- Is for the same brand niche and audience but with a TOTALLY DIFFERENT creative concept, angle, composition, and mood
- Uses design-intent language (describe scenes, lighting, mood, colors) — NOT commands like "generate" or "create"
- Depicts real, diverse people smiling within this niche when appropriate
- Is 1-3 sentences max, vivid and specific
- Never repeats the original prompt's concept — come up with something fresh

Brand context:
- Niche: ${brandContext.niche || 'general'}
- Voice: ${brandContext.voice || 'professional'}
- Audience: ${brandContext.audience || 'general'}
- Keywords: ${(brandContext.keywords || []).join(', ') || 'none'}
- Media type: ${mediaType}
- Post caption for context: "${caption.substring(0, 200)}"

Return ONLY the new prompt text, nothing else.`;

    const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite',
        messages: [
          { role: 'system', content: systemMsg },
          { role: 'user', content: `Original prompt: "${originalPrompt}"\n\nWrite a completely different creative prompt for the same brand:` },
        ],
        max_tokens: 300,
        temperature: 1.0,
      }),
    });

    if (!res.ok) {
      console.error('[smm-media-gen] Prompt variation API error:', res.status);
      return originalPrompt;
    }

    const data = await res.json();
    const varied = data.choices?.[0]?.message?.content?.trim();
    if (varied && varied.length > 20) {
      console.log(`[smm-media-gen] Varied prompt: "${varied.substring(0, 100)}…"`);
      return varied;
    }
    return originalPrompt;
  } catch (e) {
    console.error('[smm-media-gen] Prompt variation error:', e);
    return originalPrompt;
  }
}

/* ────── IMAGE GENERATION WITH REFERENCE — Banana2 (image-to-image) ────── */
async function generateImageWithReference(prompt: string, referenceImageUrl: string): Promise<string | null> {
  if (!LOVABLE_API_KEY) { console.error('[smm-media-gen] LOVABLE_API_KEY not configured'); return null; }

  try {
    console.log('[smm-media-gen] Generating image via Banana2 (reference image)...');
    const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-3-pro-image-preview',
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: referenceImageUrl } },
            { type: 'text', text: prompt },
          ],
        }],
        modalities: ['image', 'text'],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[smm-media-gen] Banana2 error:', res.status, err);
      // Fall back to Banana1 (no reference)
      console.log('[smm-media-gen] Falling back to Banana1...');
      return generateImage(prompt);
    }

    const data = await res.json();
    const choice = data.choices?.[0]?.message;
    const base64Url = choice?.images?.[0]?.image_url?.url
      || choice?.content?.find?.((p: any) => p.type === 'image_url')?.image_url?.url
      || null;
    if (!base64Url) {
      console.error('[smm-media-gen] No image in Banana2 response, falling back to Banana1');
      return generateImage(prompt);
    }

    // Upload base64 to Supabase storage
    const base64Data = base64Url.replace(/^data:image\/\w+;base64,/, '');
    const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    const fileName = `smm/generated/${crypto.randomUUID()}.png`;

    const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/content-uploads/${fileName}`, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_ROLE_KEY, 'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'image/png', 'x-upsert': 'true',
      },
      body: binaryData,
    });

    if (!uploadRes.ok) {
      console.error('[smm-media-gen] Upload failed:', await uploadRes.text());
      return null;
    }

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/content-uploads/${fileName}`;
    console.log('[smm-media-gen] Banana2 image uploaded:', publicUrl);
    return publicUrl;
  } catch (e) {
    console.error('[smm-media-gen] Banana2 error:', e);
    return generateImage(prompt);
  }
}

/* ────── IMAGE GENERATION — Lovable AI (Nano Banana / Banana1) ────── */
async function generateImage(prompt: string): Promise<string | null> {
  if (!LOVABLE_API_KEY) { console.error('[smm-media-gen] LOVABLE_API_KEY not configured'); return null; }

  try {
    console.log('[smm-media-gen] Generating image via Lovable AI...');
    const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-image',
        messages: [{ role: 'user', content: prompt }],
        modalities: ['image', 'text'],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[smm-media-gen] Lovable AI error:', res.status, err);
      return null;
    }

    const data = await res.json();
    console.log('[smm-media-gen] Image response keys:', JSON.stringify(Object.keys(data)));
    const choice = data.choices?.[0]?.message;
    // Try multiple response shapes
    const base64Url = choice?.images?.[0]?.image_url?.url
      || choice?.content?.find?.((p: any) => p.type === 'image_url')?.image_url?.url
      || (typeof choice?.content === 'string' && choice.content.match(/data:image[^"'\s]+/)?.[0])
      || null;
    if (!base64Url) {
      console.error('[smm-media-gen] No image in response. Choice:', JSON.stringify(choice).substring(0, 500));
      return null;
    }

    // Upload base64 to Supabase storage
    const base64Data = base64Url.replace(/^data:image\/\w+;base64,/, '');
    const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    const fileName = `smm/generated/${crypto.randomUUID()}.png`;

    const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/content-uploads/${fileName}`, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_ROLE_KEY, 'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'image/png', 'x-upsert': 'true',
      },
      body: binaryData,
    });

    if (!uploadRes.ok) {
      console.error('[smm-media-gen] Upload failed:', await uploadRes.text());
      return null;
    }

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/content-uploads/${fileName}`;
    console.log('[smm-media-gen] Image uploaded:', publicUrl);
    return publicUrl;
  } catch (e) {
    console.error('[smm-media-gen] Image generation error:', e);
    return null;
  }
}

/* ────── CAROUSEL GENERATION — Multiple images with retry ────── */
async function generateCarousel(prompt: string, count = 3, referenceImages?: string[]): Promise<string[] | null> {
  console.log(`[smm-media-gen] Generating carousel (${count} images)… ${referenceImages?.length ? 'with Banana2 references' : 'Banana1'}`);
  const urls: string[] = [];
  const maxRetries = 2;

  const genSlide = async (slidePrompt: string) => {
    if (referenceImages && referenceImages.length > 0) {
      const refImg = referenceImages[Math.floor(Math.random() * referenceImages.length)];
      return generateImageWithReference(slidePrompt, refImg);
    }
    return generateImage(slidePrompt);
  };

  for (let i = 0; i < count; i++) {
    let slideUrl: string | null = null;
    let attempt = 0;
    const slidePrompt = `Slide ${i + 1} of ${count} for a social media carousel. ${prompt}. Make this slide visually distinct from the others while maintaining a cohesive theme.`;

    while (attempt <= maxRetries && !slideUrl) {
      if (attempt > 0) {
        console.log(`[smm-media-gen] Retrying slide ${i + 1} (attempt ${attempt + 1}/${maxRetries + 1})…`);
        await new Promise(r => setTimeout(r, 2000 * attempt));
      }
      slideUrl = await genSlide(slidePrompt);
      attempt++;
    }

    if (slideUrl) {
      urls.push(slideUrl);
      console.log(`[smm-media-gen] Carousel slide ${i + 1}/${count} ready`);
    } else {
      console.error(`[smm-media-gen] Carousel slide ${i + 1}/${count} failed after ${maxRetries + 1} attempts`);
    }
  }

  if (urls.length > 0 && urls.length < count) {
    const missing = count - urls.length;
    console.log(`[smm-media-gen] Filling ${missing} missing carousel slot(s)…`);
    for (let j = 0; j < missing; j++) {
      const fillUrl = await genSlide(`Additional slide for a social media carousel. ${prompt}. Fresh perspective, visually distinct.`);
      if (fillUrl) urls.push(fillUrl);
    }
  }

  if (urls.length === 0) {
    console.error('[smm-media-gen] All carousel slides failed');
    return null;
  }

  console.log(`[smm-media-gen] Carousel complete: ${urls.length}/${count} slides`);
  return urls;
}
/* ────── VIDEO — Submit to Higgsfield, return request_id ────── */
async function submitVideoToHiggsfield(prompt: string, sourceImageUrl?: string): Promise<{ requestId: string; sourceImage: string } | null> {
  if (!HIGGSFIELD_API_KEY || !HIGGSFIELD_CLIENT_SECRET) {
    console.error('[smm-media-gen] Higgsfield credentials not configured');
    return null;
  }

  const authValue = `Key ${HIGGSFIELD_API_KEY}:${HIGGSFIELD_CLIENT_SECRET}`;
  const HIGGSFIELD_BASE = 'https://platform.higgsfield.ai';
  const model = 'higgsfield-ai/dop/standard';

  try {
    // Higgsfield requires a source image — generate one first if not provided
    if (!sourceImageUrl) {
      console.log('[smm-media-gen] Generating source image for video...');
      sourceImageUrl = await generateImage(`Still frame for video: ${prompt}`) ?? undefined;
      if (!sourceImageUrl) {
        console.error('[smm-media-gen] Failed to generate source image for video');
        return null;
      }
      console.log('[smm-media-gen] Source image ready:', sourceImageUrl);
    }

    console.log('[smm-media-gen] Submitting video to Higgsfield...');
    const hfPayload: Record<string, unknown> = { prompt, image_url: sourceImageUrl, duration: 5 };

    const submitRes = await fetch(`${HIGGSFIELD_BASE}/${model}`, {
      method: 'POST',
      headers: {
        'Authorization': authValue,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(hfPayload),
    });

    const submitData = await submitRes.json();
    console.log('[smm-media-gen] Higgsfield submit:', JSON.stringify(submitData));

    if (!submitRes.ok) {
      console.error('[smm-media-gen] Higgsfield submit error:', submitRes.status, submitData);
      return null;
    }

    const requestId = submitData.request_id;
    if (!requestId) {
      console.error('[smm-media-gen] No request_id from Higgsfield');
      return null;
    }

    return { requestId, sourceImage: sourceImageUrl };
  } catch (e) {
    console.error('[smm-media-gen] Video submit error:', e);
    return null;
  }
}

/* ────── VIDEO — Poll Higgsfield until completion ────── */
async function pollHiggsfield(requestId: string): Promise<string | null> {
  const authValue = `Key ${HIGGSFIELD_API_KEY}:${HIGGSFIELD_CLIENT_SECRET}`;
  const HIGGSFIELD_BASE = 'https://platform.higgsfield.ai';
  const maxAttempts = 48; // 48 × 10s = ~8 minutes

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise(r => setTimeout(r, 10000));

    console.log(`[smm-media-gen] Polling Higgsfield attempt ${attempt + 1}/${maxAttempts}...`);
    try {
      const pollRes = await fetch(`${HIGGSFIELD_BASE}/requests/${requestId}/status`, {
        headers: { 'Authorization': authValue },
      });

      if (!pollRes.ok) {
        console.warn(`[smm-media-gen] Poll HTTP error: ${pollRes.status} — retrying…`);
        continue;
      }

      const pollData = await pollRes.json();
      console.log('[smm-media-gen] Poll status:', pollData.status);

      if (pollData.status === 'completed') {
        const videoUrl = pollData.video?.url || pollData.images?.[0]?.url || null;
        if (videoUrl) {
          console.log('[smm-media-gen] Video ready:', videoUrl);
          return videoUrl;
        }
        console.error('[smm-media-gen] Completed but no URL found');
        return null;
      }

      if (pollData.status === 'failed' || pollData.status === 'nsfw') {
        console.error('[smm-media-gen] Higgsfield generation failed:', pollData.status);
        return null;
      }
    } catch (pollErr) {
      console.warn('[smm-media-gen] Poll network error — retrying…', pollErr);
      continue;
    }
  }

  console.error(`[smm-media-gen] Higgsfield timed out after ${maxAttempts} polls`);
  return null;
}

/* ────── VIDEO — Full generate (submit + poll) ────── */
async function generateVideo(prompt: string, sourceImageUrl?: string): Promise<string | null> {
  const submission = await submitVideoToHiggsfield(prompt, sourceImageUrl);
  if (!submission) return null;
  return await pollHiggsfield(submission.requestId);
}

/* ────── BACKGROUND VIDEO POLL — Updates plan item when Higgsfield finishes ────── */
async function backgroundVideoPoll(
  requestId: string,
  planId: string,
  itemId: string,
  profileUsername: string,
  platform: string,
  caption: string,
) {
  try {
    const videoUrl = await pollHiggsfield(requestId);

    // Fetch current plan state
    const planRes = await fetch(`${SUPABASE_URL}/rest/v1/smm_content_plans?id=eq.${planId}&select=schedule_items`, {
      headers: { 'apikey': SERVICE_ROLE_KEY, 'Authorization': `Bearer ${SERVICE_ROLE_KEY}` },
    });
    const plans = await planRes.json();
    if (!plans?.[0]) return;

    const items = plans[0].schedule_items as any[];
    const idx = items.findIndex((i: any) => i.id === itemId);
    if (idx === -1) return;

    if (videoUrl) {
      items[idx].media_url = videoUrl;
      items[idx].status = 'ready';
      delete items[idx].hf_request_id;

      await cortexStatus(profileUsername, platform, `✅ 🎬 Video ready via Higgsfield — saved to Content Library`);
      await logActivity('media_generated', {
        name: `🎨 Higgsfield — video generated`,
        profile: profileUsername, platform, model: 'Higgsfield', item_id: itemId, media_url: videoUrl,
      });

      // Save to content_assets
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/content_assets`, {
          method: 'POST',
          headers: {
            'apikey': SERVICE_ROLE_KEY, 'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json', 'Prefer': 'return=minimal',
          },
          body: JSON.stringify({
            title: (caption || 'SMM video').substring(0, 120),
            type: 'video', url: videoUrl, source: 'ai-generated',
            category: 'AI Generated', folder: 'AI Generated', status: 'published',
            tags: ['smm', platform || 'social', profileUsername || '', 'video'].filter(Boolean),
          }),
        });
      } catch (e) { console.error('[smm-media-gen] content_assets insert error:', e); }
    } else {
      items[idx].status = 'failed';
      delete items[idx].hf_request_id;
      await cortexStatus(profileUsername, platform, `❌ Video generation failed — try again with a different prompt`);
      await logActivity('media_generation_failed', {
        name: `❌ Media gen failed: video`, profile: profileUsername, item_id: itemId,
      });
    }

    // Save updated plan
    await fetch(`${SUPABASE_URL}/rest/v1/smm_content_plans?id=eq.${planId}`, {
      method: 'PATCH',
      headers: {
        'apikey': SERVICE_ROLE_KEY, 'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json', 'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ schedule_items: items, updated_at: new Date().toISOString() }),
    });
  } catch (e) {
    console.error('[smm-media-gen] Background video poll error:', e);
  }
}

/** Get next N calendar day strings in YYYY-MM-DD format */
function getNextNDays(n: number): string[] {
  const dates: string[] = [];
  const now = new Date();
  for (let i = 0; i <= n; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    let forceDates: string[] | null = null;
    let planId: string | null = null;
    let singleItem: { id: string; type: string; prompt: string } | null = null;
    let forceRegenerate = false;

    if (req.method === 'POST') {
      try {
        const body = await req.json();
        forceDates = body.force_dates || null;
        planId = body.plan_id || null;
        singleItem = body.single_item || null;
        forceRegenerate = body.force_regenerate === true;
      } catch { /* no body */ }
    }

    const targetDates = new Set(forceDates || getNextNDays(2));
    console.log('[smm-media-gen] Target dates:', [...targetDates]);

    // Fetch content plans
    let plansQuery = `${SUPABASE_URL}/rest/v1/smm_content_plans?select=*`;
    if (planId) {
      plansQuery += `&id=eq.${planId}`;
    } else if (forceDates) {
      plansQuery += `&status=in.(live,draft)`;
    } else {
      plansQuery += `&status=eq.live`;
    }

    const plansRes = await fetch(plansQuery, {
      headers: { 'apikey': SERVICE_ROLE_KEY, 'Authorization': `Bearer ${SERVICE_ROLE_KEY}` },
    });
    const plans = await plansRes.json();

    if (!Array.isArray(plans) || plans.length === 0) {
      return new Response(JSON.stringify({ message: 'No plans found', generated: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let generated = 0;
    let skipped = 0;
    const firstPlan = plans[0];

    // Announce generation start
    await cortexStatus(firstPlan.profile_username, firstPlan.platform, `⚡ Starting AI media generation for ${[...targetDates].length} day(s)…`);

    for (const plan of plans) {
      const items = (plan.schedule_items || []) as any[];
      let updated = false;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];

        // If regenerating a single item, skip all others
        if (singleItem && item.id !== singleItem.id) continue;

        // Skip non-media items
        if (item.type === 'text') continue;
        if (!item.media_prompt && !item.caption) continue;

        // Detect video items that got a .png fallback — they need re-generation
        const isVideoWithImageFallback = item.type === 'video' && item.media_url && /\.(png|jpg|jpeg|webp)$/i.test(item.media_url);
        const isRegenRequest = singleItem && item.id === singleItem.id;

        // NEVER skip — always regenerate all items with fresh prompts and new media
        // Old content stays visible until new content replaces it (handled per-item save below)
        const itemDate = item.date;

        if (isVideoWithImageFallback) {
          console.log(`[smm-media-gen] Re-generating video (had .png fallback) for ${itemDate}`);
        }
        console.log(`[smm-media-gen] Generating ${item.type} for "${(item.caption || '').substring(0, 40)}…" on ${itemDate}`);
        items[i].status = 'generating';

        const captionSnippet = (item.caption || '').substring(0, 50);
        await cortexStatus(plan.profile_username, plan.platform, `🎨 Generating ${item.type} for ${itemDate}…\n"${captionSnippet}…"`);

        const basePrompt = item.media_prompt || `Create a visually striking social media ${item.type} post: ${item.caption}`;
        
        // Always generate a fresh varied prompt using AI + brand context
        const prompt = await varyPrompt(basePrompt, item.type, plan.brand_context || {}, item.caption || '');
        // Save the new prompt back to the item for reference
        items[i].media_prompt = prompt;
        
        let mediaUrl: string | null = null;
        let carouselUrls: string[] | null = null;

        if (item.type === 'video') {
          await cortexStatus(plan.profile_username, plan.platform, `🎬 Submitting video to Higgsfield AI… (takes 2-5 min)`);
          
          // Submit to Higgsfield — get request_id fast, then poll in background
          const submission = await submitVideoToHiggsfield(prompt);
          if (submission) {
            // Save "generating" status + request_id immediately so UI knows it's in progress
            items[i].status = 'generating';
            items[i].hf_request_id = submission.requestId;
            items[i].media_url = submission.sourceImage; // show source image as placeholder
            
            // Save progress now
            await fetch(`${SUPABASE_URL}/rest/v1/smm_content_plans?id=eq.${plan.id}`, {
              method: 'PATCH',
              headers: {
                'apikey': SERVICE_ROLE_KEY, 'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
                'Content-Type': 'application/json', 'Prefer': 'return=minimal',
              },
              body: JSON.stringify({ schedule_items: items, updated_at: new Date().toISOString() }),
            });

            await cortexStatus(plan.profile_username, plan.platform, `⏳ Video submitted (ID: ${submission.requestId.substring(0, 8)}…). Polling Higgsfield until ready…`);

            // Fire background poll — this runs independently of the HTTP response
            // Using a self-invoking async function that keeps polling
            backgroundVideoPoll(
              submission.requestId, plan.id, item.id,
              plan.profile_username, plan.platform, item.caption || '',
            ).catch(e => console.error('[smm-media-gen] Background poll error:', e));

            generated++;
            // Skip the rest of the normal flow for this item — background handles it
            continue;
          } else {
            await cortexStatus(plan.profile_username, plan.platform, `⚠️ Video submission failed — falling back to image…`);
            const referenceImages = (plan.brand_context?.reference_images || []) as string[];
            if (referenceImages.length > 0) {
              const refImg = referenceImages[Math.floor(Math.random() * referenceImages.length)];
              mediaUrl = await generateImageWithReference(prompt, refImg);
            } else {
              mediaUrl = await generateImage(prompt);
            }
          }
        } else if (item.type === 'carousel') {
          await cortexStatus(plan.profile_username, plan.platform, `📸 Generating carousel slides…`);
          const referenceImages = (plan.brand_context?.reference_images || []) as string[];
          carouselUrls = await generateCarousel(prompt, 3, referenceImages.length > 0 ? referenceImages : undefined);
          if (carouselUrls) {
            mediaUrl = carouselUrls[0]; // Primary thumbnail
          }
        } else {
          // image → Check for brand reference images (use Banana2) or Banana1
          const referenceImages = (plan.brand_context?.reference_images || []) as string[];
          if (referenceImages.length > 0) {
            // Pick a random reference image for variety
            const refImg = referenceImages[Math.floor(Math.random() * referenceImages.length)];
            console.log(`[smm-media-gen] Using Banana2 with reference image: ${refImg}`);
            mediaUrl = await generateImageWithReference(prompt, refImg);
          } else {
            mediaUrl = await generateImage(prompt);
          }
        }

        // Determine which model was used for notification context
        const referenceImagesUsed = ((plan.brand_context?.reference_images || []) as string[]).length > 0;
        const modelLabel = referenceImagesUsed ? 'Nano Banana 2 (Custom)' : 'Nano Banana 1';

        if (mediaUrl) {
          items[i].media_url = mediaUrl;
          if (carouselUrls && carouselUrls.length > 1) {
            items[i].carousel_urls = carouselUrls;
          }
          items[i].status = 'ready';
          generated++;

          const slideCount = carouselUrls ? carouselUrls.length : 1;
          await cortexStatus(plan.profile_username, plan.platform,
            `✅ ${item.type === 'video' ? '🎬' : item.type === 'carousel' ? `📸 ${slideCount} slides` : '🖼️'} ${item.type} ready for ${itemDate} via ${modelLabel} — saved to Content Library`);

          // Insert into content_assets — for carousels, insert each slide
          const urlsToSave = carouselUrls || [mediaUrl];
          for (const assetUrl of urlsToSave) {
            try {
              await fetch(`${SUPABASE_URL}/rest/v1/content_assets`, {
                method: 'POST',
                headers: {
                  'apikey': SERVICE_ROLE_KEY, 'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
                  'Content-Type': 'application/json', 'Prefer': 'return=minimal',
                },
                body: JSON.stringify({
                  title: (item.caption || `SMM ${item.type}`).substring(0, 120),
                  type: item.type === 'video' ? 'video' : 'image',
                  url: assetUrl,
                  source: 'ai-generated',
                  category: 'AI Generated',
                  folder: 'AI Generated',
                  status: 'published',
                  tags: ['smm', plan.platform || 'social', plan.profile_username || '', item.type === 'carousel' ? 'carousel' : '', referenceImagesUsed ? 'banana2' : 'banana1'].filter(Boolean),
                }),
              });
            } catch (e) { console.error('[smm-media-gen] content_assets insert error:', e); }
          }

          await logActivity('media_generated', {
            name: `🎨 ${modelLabel} — ${item.type} generated for ${itemDate}`,
            profile: plan.profile_username,
            platform: plan.platform,
            model: modelLabel,
            custom_references: referenceImagesUsed,
            item_id: item.id,
            date: itemDate,
            media_url: mediaUrl,
          });
        } else {
          items[i].status = 'failed';
          await cortexStatus(plan.profile_username, plan.platform, `❌ Failed to generate ${item.type} for ${itemDate}`);
          await logActivity('media_generation_failed', {
            name: `❌ Media gen failed: ${item.type}`,
            profile: plan.profile_username,
            item_id: item.id,
            date: itemDate,
          });
        }

        // Save after EACH item to prevent timeout data loss
        console.log(`[smm-media-gen] Saving progress after item ${i + 1}/${items.length}...`);
        await fetch(`${SUPABASE_URL}/rest/v1/smm_content_plans?id=eq.${plan.id}`, {
          method: 'PATCH',
          headers: {
            'apikey': SERVICE_ROLE_KEY, 'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json', 'Prefer': 'return=minimal',
          },
          body: JSON.stringify({ schedule_items: items, updated_at: new Date().toISOString() }),
        });
      }
    }

    // Summary message
    await cortexStatus(firstPlan.profile_username, firstPlan.platform,
      generated > 0
        ? `🏁 Done! Generated ${generated} asset(s)${skipped > 0 ? `, skipped ${skipped}` : ''}. Check your schedule & Content Library.`
        : `⚠️ No new assets generated (${skipped} skipped — already ready or out of date range).`
    );

    return new Response(JSON.stringify({
      message: `Media generation complete. Generated ${generated} asset(s), skipped ${skipped}.`,
      generated, skipped,
      target_dates: [...targetDates],
      plans_processed: plans.length,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    console.error('[smm-media-gen] error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

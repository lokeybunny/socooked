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

/* ────── IMAGE GENERATION — Lovable AI (Nano Banana) ────── */
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

/* ────── CAROUSEL GENERATION — Multiple images ────── */
async function generateCarousel(prompt: string, count = 3): Promise<string[] | null> {
  console.log(`[smm-media-gen] Generating carousel (${count} images)…`);
  const urls: string[] = [];

  for (let i = 0; i < count; i++) {
    const slidePrompt = `Slide ${i + 1} of ${count} for a social media carousel. ${prompt}. Make this slide visually distinct from the others while maintaining a cohesive theme.`;
    const url = await generateImage(slidePrompt);
    if (url) {
      urls.push(url);
      console.log(`[smm-media-gen] Carousel slide ${i + 1}/${count} ready`);
    } else {
      console.error(`[smm-media-gen] Carousel slide ${i + 1}/${count} failed`);
    }
  }

  if (urls.length === 0) {
    console.error('[smm-media-gen] All carousel slides failed');
    return null;
  }

  // Ensure at least 2 images for a valid carousel; retry once if we only got 1
  if (urls.length < 2) {
    console.log('[smm-media-gen] Only 1 slide succeeded, retrying for a 2nd…');
    const retry = await generateImage(`Slide 2 of ${count} for carousel. ${prompt}. Different angle or perspective.`);
    if (retry) urls.push(retry);
  }

  console.log(`[smm-media-gen] Carousel complete: ${urls.length}/${count} slides`);
  return urls.length >= 2 ? urls : null;
}
/* ────── VIDEO GENERATION — Higgsfield API (submit + poll) ────── */
async function generateVideo(prompt: string, sourceImageUrl?: string): Promise<string | null> {
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

    // 1) Submit generation request
    const hfPayload: Record<string, unknown> = {
      prompt,
      image_url: sourceImageUrl,
      duration: 5,
    };

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

    // 2) Poll for completion (max ~3 minutes, check every 15s)
    const maxAttempts = 12;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise(r => setTimeout(r, 15000)); // wait 15s

      console.log(`[smm-media-gen] Polling Higgsfield attempt ${attempt + 1}/${maxAttempts}...`);
      const pollRes = await fetch(`${HIGGSFIELD_BASE}/requests/${requestId}/status`, {
        headers: { 'Authorization': authValue },
      });
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
      // Otherwise keep polling (queued, in_progress, etc.)
    }

    console.error('[smm-media-gen] Higgsfield timed out after polling');
    return null;
  } catch (e) {
    console.error('[smm-media-gen] Video generation error:', e);
    return null;
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

    if (req.method === 'POST') {
      try {
        const body = await req.json();
        forceDates = body.force_dates || null;
        planId = body.plan_id || null;
        singleItem = body.single_item || null;
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

        if (!isRegenRequest && item.media_url && item.status === 'ready' && !isVideoWithImageFallback) { skipped++; continue; }
        if (!isRegenRequest && !isVideoWithImageFallback && item.status !== 'draft' && item.status !== 'failed' && item.status !== 'planned') { skipped++; continue; }

        const itemDate = item.date;
        if (!isRegenRequest && !targetDates.has(itemDate)) { skipped++; continue; }

        if (isVideoWithImageFallback) {
          console.log(`[smm-media-gen] Re-generating video (had .png fallback) for ${itemDate}`);
        }
        console.log(`[smm-media-gen] Generating ${item.type} for "${(item.caption || '').substring(0, 40)}…" on ${itemDate}`);
        items[i].status = 'generating';

        const captionSnippet = (item.caption || '').substring(0, 50);
        await cortexStatus(plan.profile_username, plan.platform, `🎨 Generating ${item.type} for ${itemDate}…\n"${captionSnippet}…"`);

        const prompt = item.media_prompt || `Create a visually striking social media ${item.type} post: ${item.caption}`;
        let mediaUrl: string | null = null;
        let carouselUrls: string[] | null = null;

        if (item.type === 'video') {
          await cortexStatus(plan.profile_username, plan.platform, `🎬 Submitting video to Higgsfield AI…`);
          mediaUrl = await generateVideo(prompt);
          if (!mediaUrl) {
            await cortexStatus(plan.profile_username, plan.platform, `⚠️ Video generation failed — falling back to image…`);
            mediaUrl = await generateImage(prompt);
          }
        } else if (item.type === 'carousel') {
          await cortexStatus(plan.profile_username, plan.platform, `📸 Generating carousel slides…`);
          carouselUrls = await generateCarousel(prompt, 3);
          if (carouselUrls) {
            mediaUrl = carouselUrls[0]; // Primary thumbnail
          }
        } else {
          // image → Lovable AI
          mediaUrl = await generateImage(prompt);
        }

        if (mediaUrl) {
          items[i].media_url = mediaUrl;
          if (carouselUrls && carouselUrls.length > 1) {
            items[i].carousel_urls = carouselUrls;
          }
          items[i].status = 'ready';
          generated++;

          const slideCount = carouselUrls ? carouselUrls.length : 1;
          await cortexStatus(plan.profile_username, plan.platform,
            `✅ ${item.type === 'video' ? '🎬' : item.type === 'carousel' ? `📸 ${slideCount} slides` : '🖼️'} ${item.type} ready for ${itemDate} — saved to Content Library`);

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
                  tags: ['smm', plan.platform || 'social', plan.profile_username || '', item.type === 'carousel' ? 'carousel' : ''].filter(Boolean),
                }),
              });
            } catch (e) { console.error('[smm-media-gen] content_assets insert error:', e); }
          }

          await logActivity('media_generated', {
            name: `🎨 Media generated: ${item.type}`,
            profile: plan.profile_username,
            platform: plan.platform,
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

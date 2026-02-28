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
    const base64Url = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!base64Url) {
      console.error('[smm-media-gen] No image in response');
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
    console.log('[smm-media-gen] Submitting video to Higgsfield...');

    // 1) Submit generation request
    const hfPayload: Record<string, unknown> = { prompt };
    if (sourceImageUrl) {
      hfPayload.image_url = sourceImageUrl;
      hfPayload.duration = 5;
    }

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

    if (req.method === 'POST') {
      try {
        const body = await req.json();
        forceDates = body.force_dates || null;
        planId = body.plan_id || null;
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

    for (const plan of plans) {
      const items = (plan.schedule_items || []) as any[];
      let updated = false;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.media_url && item.status === 'ready') { skipped++; continue; }
        if (item.type === 'text') continue;
        if (!item.media_prompt && !item.caption) continue;
        if (item.status !== 'draft' && item.status !== 'failed' && item.status !== 'planned') { skipped++; continue; }

        const itemDate = item.date;
        if (!targetDates.has(itemDate)) { skipped++; continue; }

        console.log(`[smm-media-gen] Generating ${item.type} for "${(item.caption || '').substring(0, 40)}…" on ${itemDate}`);
        items[i].status = 'generating';

        const prompt = item.media_prompt || `Create a visually striking social media ${item.type} post: ${item.caption}`;
        let mediaUrl: string | null = null;

        if (item.type === 'video') {
          // Try video via Higgsfield; fallback to image via Lovable AI
          mediaUrl = await generateVideo(prompt);
          if (!mediaUrl) {
            console.log('[smm-media-gen] Video failed, falling back to image');
            mediaUrl = await generateImage(prompt);
          }
        } else {
          // image or carousel → Lovable AI
          mediaUrl = await generateImage(prompt);
        }

        if (mediaUrl) {
          items[i].media_url = mediaUrl;
          items[i].status = 'ready';
          generated++;
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
          await logActivity('media_generation_failed', {
            name: `❌ Media gen failed: ${item.type}`,
            profile: plan.profile_username,
            item_id: item.id,
            date: itemDate,
          });
        }
        updated = true;
      }

      if (updated) {
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

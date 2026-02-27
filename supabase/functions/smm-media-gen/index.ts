import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

/**
 * SMM Media Generator — generates images (Nano Banana) and videos (Higgsfield)
 * for scheduled content plan items that are within 48 hours of their post date.
 *
 * Called on a cron schedule or manually. Only processes items in "live" plans
 * that have status "draft" and are within the 48-hour generation window.
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

async function generateImage(prompt: string): Promise<string | null> {
  if (!LOVABLE_API_KEY) { console.error('[smm-media-gen] LOVABLE_API_KEY not configured'); return null; }

  try {
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
      console.error('[smm-media-gen] Nano Banana error:', res.status, err);
      return null;
    }

    const data = await res.json();
    const base64Url = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!base64Url) return null;

    // Upload to Supabase storage
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

    return `${SUPABASE_URL}/storage/v1/object/public/content-uploads/${fileName}`;
  } catch (e) {
    console.error('[smm-media-gen] Image generation error:', e);
    return null;
  }
}

async function generateVideo(prompt: string, sourceImageUrl?: string): Promise<string | null> {
  if (!HIGGSFIELD_API_KEY) { console.error('[smm-media-gen] HIGGSFIELD_API_KEY not configured'); return null; }

  try {
    // Use Higgsfield API to start video generation
    const res = await fetch(`${SUPABASE_URL}/functions/v1/higgsfield-api`, {
      method: 'POST',
      headers: {
        'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'create',
        model: 'soul-turbo',
        prompt,
        image_url: sourceImageUrl || null,
      }),
    });

    if (!res.ok) {
      console.error('[smm-media-gen] Higgsfield error:', await res.text());
      return null;
    }

    const data = await res.json();
    // Higgsfield is async — return the task ID for polling
    return data.video_url || data.task_id || null;
  } catch (e) {
    console.error('[smm-media-gen] Video generation error:', e);
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    // Fetch all LIVE content plans
    const plansRes = await fetch(`${SUPABASE_URL}/rest/v1/smm_content_plans?status=eq.live&select=*`, {
      headers: { 'apikey': SERVICE_ROLE_KEY, 'Authorization': `Bearer ${SERVICE_ROLE_KEY}` },
    });
    const plans = await plansRes.json();

    if (!Array.isArray(plans) || plans.length === 0) {
      return new Response(JSON.stringify({ message: 'No live plans found', generated: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const now = new Date();
    const cutoff = new Date(now.getTime() + 48 * 60 * 60 * 1000); // 48 hours from now
    let generated = 0;

    for (const plan of plans) {
      const items = (plan.schedule_items || []) as any[];
      let updated = false;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        // Skip if already generated or not a media type
        if (item.status !== 'draft' || !item.media_prompt) continue;
        if (item.type === 'text') continue;

        // Check if within 48-hour window
        const postDate = new Date(`${item.date}T${item.time || '12:00'}:00Z`);
        if (postDate > cutoff) continue; // Not within window yet
        if (postDate < now) continue; // Already past

        console.log(`[smm-media-gen] Generating ${item.type} for "${item.caption?.substring(0, 40)}…"`);
        items[i].status = 'generating';

        let mediaUrl: string | null = null;

        if (item.type === 'video') {
          mediaUrl = await generateVideo(item.media_prompt);
        } else {
          // image or carousel
          mediaUrl = await generateImage(item.media_prompt);
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
            media_url: mediaUrl,
          });
        } else {
          items[i].status = 'failed';
          await logActivity('media_generation_failed', {
            name: `❌ Media gen failed: ${item.type}`,
            profile: plan.profile_username,
            item_id: item.id,
          });
        }
        updated = true;
      }

      // Update the plan with new item statuses
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
      message: `Media generation complete. Generated ${generated} asset(s).`,
      generated,
      plans_processed: plans.length,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    console.error('[smm-media-gen] error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

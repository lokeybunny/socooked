import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const APIFY_TOKEN = Deno.env.get('APIFY_TOKEN_COMMUNITY')!;
const ACTOR_ID = 'curious_coder~twitter-community-members-scraper';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { action, communityUrl, verifiedOnly, runId } = await req.json();

    // ─── START a new scrape run ───
    if (action === 'start') {
      if (!communityUrl) {
        return new Response(JSON.stringify({ error: 'communityUrl is required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const input: Record<string, unknown> = {
        communityUrl,
      };

      const startUrl = `https://api.apify.com/v2/acts/${ACTOR_ID}/runs?token=${APIFY_TOKEN}`;
      const res = await fetch(startUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error('[comm-extract] Apify start error:', res.status, errText);
        return new Response(JSON.stringify({ error: `Apify error ${res.status}: ${errText}` }), {
          status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const data = await res.json();
      const id = data?.data?.id;
      const defaultDatasetId = data?.data?.defaultDatasetId;

      return new Response(JSON.stringify({ success: true, runId: id, datasetId: defaultDatasetId }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── POLL for results ───
    if (action === 'poll') {
      if (!runId) {
        return new Response(JSON.stringify({ error: 'runId is required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check run status
      const statusUrl = `https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`;
      const statusRes = await fetch(statusUrl);
      const statusData = await statusRes.json();
      const runStatus = statusData?.data?.status; // READY, RUNNING, SUCCEEDED, FAILED, ABORTED, TIMED-OUT
      const datasetId = statusData?.data?.defaultDatasetId;

      if (['FAILED', 'ABORTED', 'TIMED-OUT'].includes(runStatus)) {
        return new Response(JSON.stringify({ success: false, status: runStatus, members: [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Fetch partial/complete results from dataset
      let members: { handle: string; name: string; verified: boolean; followers: number; bio: string }[] = [];
      if (datasetId) {
        const dataUrl = `https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}&limit=5000`;
        const dataRes = await fetch(dataUrl);
        if (dataRes.ok) {
          const items = await dataRes.json();
          members = (items || []).map((item: any) => ({
            handle: item.screen_name || item.username || item.handle || '',
            name: item.name || item.display_name || '',
            verified: !!(item.is_blue_verified || item.verified || item.is_verified),
            followers: item.followers_count || item.follower_count || 0,
            bio: item.description || item.bio || '',
          })).filter((m: any) => m.handle);
        }
      }

      // Apply verified filter server-side if requested
      if (verifiedOnly) {
        members = members.filter(m => m.verified);
      }

      const done = runStatus === 'SUCCEEDED';

      return new Response(JSON.stringify({
        success: true,
        status: runStatus,
        done,
        total: members.length,
        members,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action. Use "start" or "poll".' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('[comm-extract] error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

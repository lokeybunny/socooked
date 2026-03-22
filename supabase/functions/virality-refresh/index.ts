import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const X_API = "https://api.x.com/2";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const bearerToken = Deno.env.get("TWITTER_BEARER_TOKEN");
    if (!bearerToken) throw new Error("Missing TWITTER_BEARER_TOKEN");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get tweets from last 24h that need refreshing
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: tweets, error } = await supabase
      .from("shill_post_analytics")
      .select("id, tweet_id, tweet_url")
      .gte("created_at", cutoff)
      .order("updated_at", { ascending: true })
      .limit(80); // X API rate-friendly batch

    if (error) throw error;
    if (!tweets?.length) {
      return new Response(JSON.stringify({ updated: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Batch fetch in groups of 100 (X API max)
    const tweetIds = tweets.map((t: any) => t.tweet_id).filter(Boolean);
    let updated = 0;

    for (let i = 0; i < tweetIds.length; i += 100) {
      const batch = tweetIds.slice(i, i + 100);
      const idsParam = batch.join(",");

      const res = await fetch(
        `${X_API}/tweets?ids=${idsParam}&tweet.fields=public_metrics,created_at,author_id&expansions=author_id&user.fields=username,name`,
        { headers: { Authorization: `Bearer ${bearerToken}` } }
      );

      if (!res.ok) {
        console.error(`[virality-refresh] X API ${res.status}: ${await res.text()}`);
        continue;
      }

      const json = await res.json();
      const usersMap: Record<string, any> = {};
      for (const u of json.includes?.users || []) {
        usersMap[u.id] = u;
      }

      for (const tweet of json.data || []) {
        const metrics = tweet.public_metrics || {};
        const author = usersMap[tweet.author_id];

        const { error: upsertErr } = await supabase
          .from("shill_post_analytics")
          .update({
            likes: metrics.like_count || 0,
            retweets: metrics.retweet_count || 0,
            replies: metrics.reply_count || 0,
            views: metrics.impression_count || 0,
            author_handle: author?.username || undefined,
            author_name: author?.name || undefined,
            text_content: tweet.text || undefined,
            updated_at: new Date().toISOString(),
          })
          .eq("tweet_id", tweet.id);

        if (!upsertErr) updated++;
      }
    }

    // Auto-prune tweets older than 24h with very low engagement
    const pruneAge = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await supabase
      .from("shill_post_analytics")
      .delete()
      .lt("created_at", pruneAge)
      .lt("likes", 5)
      .lt("views", 100);

    return new Response(JSON.stringify({ updated, total: tweets.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[virality-refresh] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

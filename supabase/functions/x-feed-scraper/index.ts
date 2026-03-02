import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Fetch latest 200 tweets from the x_feed_tweets table, newest first
    const { data: rows, error } = await supabase
      .from("x_feed_tweets")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw new Error(`DB query failed: ${error.message}`);

    // For tweets without media, try to fetch OG image from source URL
    const tweetsToUpdate: { id: string; media_url: string }[] = [];
    const rowsWithOg = await Promise.all((rows || []).map(async (tw: any) => {
      if (!tw.media_url && tw.source_url) {
        try {
          const ogRes = await fetch(tw.source_url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; bot)' },
            redirect: 'follow',
            signal: AbortSignal.timeout(5000),
          });
          if (ogRes.ok) {
            const html = await ogRes.text();
            const ogMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
              || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i)
              || html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i)
              || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i);
            if (ogMatch?.[1]) {
              tw.media_url = ogMatch[1];
              tweetsToUpdate.push({ id: tw.id, media_url: ogMatch[1] });
            }
          }
        } catch { /* skip */ }
      }
      return tw;
    }));

    // Persist discovered OG images back to DB (fire-and-forget)
    if (tweetsToUpdate.length > 0) {
      Promise.all(tweetsToUpdate.map(u =>
        supabase.from('x_feed_tweets').update({ media_url: u.media_url }).eq('id', u.id)
      )).catch(() => {});
    }

    const tweets = rowsWithOg.map((tw: any) => ({
      id: tw.id,
      text: tw.tweet_text,
      user: tw.author_username,
      display_name: tw.author_display_name,
      avatar: tw.author_avatar || "",
      verified: tw.verified || false,
      gold: tw.gold || false,
      likes: tw.likes || 0,
      retweets: tw.retweets || 0,
      replies: tw.replies || 0,
      views: tw.views || 0,
      created_at: tw.created_at,
      media_url: tw.media_url || "",
      url: tw.source_url || "",
    }));

    return new Response(JSON.stringify({
      tweets,
      total_scraped: tweets.length,
      accounts_covered: tweets.length,
      chunk: 0,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("X Feed scraper error:", err);
    return new Response(JSON.stringify({ error: err.message || "Feed failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

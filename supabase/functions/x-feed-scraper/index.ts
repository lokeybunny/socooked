import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function fetchOgImage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' },
      redirect: 'follow',
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) { await res.text().catch(() => {}); return null; }
    // Only read first 50KB to find meta tags quickly
    const reader = res.body?.getReader();
    if (!reader) return null;
    let html = '';
    const decoder = new TextDecoder();
    while (html.length < 50000) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
      // Check if we already have what we need
      const match = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
        || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i)
        || html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i)
        || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i);
      if (match?.[1]) {
        reader.cancel().catch(() => {});
        return match[1];
      }
    }
    reader.cancel().catch(() => {});
    return null;
  } catch {
    return null;
  }
}

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

    const allRows = rows || [];

    // Find posts missing media that have a source URL
    const needsOg = allRows.filter((tw: any) => !tw.media_url && tw.source_url);
    console.log(`[x-feed] ${allRows.length} total, ${needsOg.length} need OG image`);

    // Process in batches of 5 to avoid overwhelming connections (max 25 per call)
    const toProcess = needsOg.slice(0, 25);
    const ogResults: { id: string; media_url: string }[] = [];

    for (let i = 0; i < toProcess.length; i += 5) {
      const batch = toProcess.slice(i, i + 5);
      const results = await Promise.all(batch.map(async (tw: any) => {
        const ogUrl = await fetchOgImage(tw.source_url);
        if (ogUrl) {
          return { id: tw.id, media_url: ogUrl };
        }
        return null;
      }));
      for (const r of results) {
        if (r) ogResults.push(r);
      }
    }

    // Persist discovered OG images back to DB
    if (ogResults.length > 0) {
      console.log(`[x-feed] Found ${ogResults.length} OG images, saving to DB`);
      await Promise.all(ogResults.map(u =>
        supabase.from('x_feed_tweets').update({ media_url: u.media_url }).eq('id', u.id)
      ));
      // Update local rows too
      for (const u of ogResults) {
        const row = allRows.find((r: any) => r.id === u.id);
        if (row) (row as any).media_url = u.media_url;
      }
    }

    const tweets = allRows.map((tw: any) => ({
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
      og_backfilled: ogResults.length,
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

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

    const tweets = (rows || []).map((tw: any) => ({
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

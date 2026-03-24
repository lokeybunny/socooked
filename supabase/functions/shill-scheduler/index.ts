import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const now = new Date();
    const nowIso = now.toISOString();
    const MIN_GAP_MS = 20 * 60 * 1000; // 20 minutes between posts

    // ── Anti-spam: check when the last post was actually sent ──
    const { data: lastPosted } = await supabase
      .from("shill_scheduled_posts")
      .select("updated_at")
      .in("status", ["posted", "processing"])
      .order("updated_at", { ascending: false })
      .limit(1)
      .single();

    if (lastPosted?.updated_at) {
      const lastPostedMs = new Date(lastPosted.updated_at).getTime();
      const elapsed = now.getTime() - lastPostedMs;
      if (elapsed < MIN_GAP_MS) {
        const waitMin = Math.ceil((MIN_GAP_MS - elapsed) / 60000);
        return json({ ok: true, processed: 0, skipped: true, wait_minutes: waitMin, reason: `Last post was ${Math.floor(elapsed / 60000)}m ago, need ${Math.ceil(MIN_GAP_MS / 60000)}m gap` });
      }
    }

    // ── Hourly rate limit: max 3 posts in the last 60 minutes ──
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const { count: postsLastHour } = await supabase
      .from("shill_scheduled_posts")
      .select("id", { count: "exact", head: true })
      .eq("status", "posted")
      .gte("updated_at", oneHourAgo);

    if ((postsLastHour ?? 0) >= 3) {
      return json({ ok: true, processed: 0, skipped: true, reason: "3 posts already sent in the last hour" });
    }

    // Only process 1 post per invocation to enforce natural pacing
    const { data: duePosts, error: fetchErr } = await supabase
      .from("shill_scheduled_posts")
      .select("*")
      .eq("status", "scheduled")
      .lte("scheduled_at", nowIso)
      .order("scheduled_at", { ascending: true })
      .limit(1);

    if (fetchErr) return json({ error: fetchErr.message }, 500);
    if (!duePosts || duePosts.length === 0) return json({ ok: true, processed: 0 });

    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const TG_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
    const X_COMMUNITY_ID = "2029596385180291485";
    let processed = 0;

    for (const post of duePosts) {
      // Mark as processing
      await supabase.from("shill_scheduled_posts").update({ status: "processing" }).eq("id", post.id);

      try {
        // Append [VIDEO FROM TIKTOK] signature if missing
        const captionWithSig = post.caption.includes('[VIDEO FROM TIKTOK]')
          ? post.caption
          : `${post.caption}\n\n[VIDEO FROM TIKTOK]`;

        // Post to Upload-Post API
        const postRes = await fetch(`${SUPABASE_URL}/functions/v1/smm-api?action=upload-video`, {
          method: "POST",
          headers: {
            "apikey": ANON_KEY,
            "Authorization": `Bearer ${ANON_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: captionWithSig,
            video: post.video_url,
            "platform[]": ["x"],
            user: post.x_account || "xslaves",
            community_id: post.community_id || X_COMMUNITY_ID,
          }),
        });

        const postResult = await postRes.json();

        if (!postRes.ok || postResult?.error) {
          const errMsg = postResult?.error || postResult?.message || `HTTP ${postRes.status}`;
          await supabase.from("shill_scheduled_posts").update({
            status: "failed",
            error: errMsg,
          }).eq("id", post.id);

          // Notify via Telegram
          if (post.chat_id && TG_TOKEN) {
            await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: post.chat_id,
                text: `❌ Scheduled shill failed:\n"${post.caption}"\n\nError: ${errMsg}`,
              }),
            });
          }
          continue;
        }

        const requestId = postResult?.request_id || postResult?.data?.request_id || "";

        // Poll for completion
        let postUrl = "";
        let statusLabel = "submitted";
        if (requestId) {
          for (let poll = 0; poll < 12; poll++) {
            await new Promise((r) => setTimeout(r, 5000));
            try {
              const statusRes = await fetch(
                `${SUPABASE_URL}/functions/v1/smm-api?action=upload-status&request_id=${requestId}`,
                { headers: { "apikey": ANON_KEY, "Authorization": `Bearer ${ANON_KEY}` } },
              );
              const statusData = await statusRes.json();
              const st = statusData?.status || statusData?.data?.status || "";
              if (st === "completed" || st === "success" || st === "done") {
                statusLabel = "completed";
                postUrl = statusData?.post_url || statusData?.data?.post_url ||
                  statusData?.posts?.[0]?.post_url || statusData?.data?.posts?.[0]?.post_url || "";
                break;
              }
              if (st === "failed" || st === "error") {
                statusLabel = "failed";
                break;
              }
            } catch (_) { /* continue polling */ }
          }
        }

        if (statusLabel === "failed") {
          await supabase.from("shill_scheduled_posts").update({
            status: "failed",
            request_id: requestId,
            error: "Video processing failed on provider side",
          }).eq("id", post.id);
        } else {
          await supabase.from("shill_scheduled_posts").update({
            status: "posted",
            request_id: requestId,
            post_url: postUrl || null,
          }).eq("id", post.id);
        }

        // Notify via Telegram
        if (post.chat_id && TG_TOKEN) {
          const statusIcon = statusLabel === "failed" ? "❌" : "✅";
          let msg = `${statusIcon} <b>Scheduled post ${statusLabel === "failed" ? "failed" : "published"}!</b>\n\n📝 "${post.caption}"`;
          if (postUrl) msg += `\n\n🔗 <a href="${postUrl}">View Post on X</a>`;
          await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: post.chat_id,
              text: msg,
              parse_mode: "HTML",
              disable_web_page_preview: false,
            }),
          });
        }

        processed++;
      } catch (err: any) {
        console.error(`[shill-scheduler] error processing ${post.id}:`, err.message);
        await supabase.from("shill_scheduled_posts").update({
          status: "failed",
          error: err.message,
        }).eq("id", post.id);
      }
    }

    return json({ ok: true, processed });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-bot-secret",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const API_BASE = "https://api.upload-post.com/api";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const UPLOAD_POST_API_KEY = Deno.env.get("UPLOAD_POST_API_KEY")!;
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "";

  // Helper: audit log
  async function audit(action: string, entityType: string, entityId: string, metadata: any = {}) {
    await supabase.from("reply_engine_audit_logs").insert({
      action, entity_type: entityType, entity_id: entityId, metadata,
    });
  }

  // Helper: get settings
  async function getSettings(): Promise<Record<string, any>> {
    const { data } = await supabase.from("reply_engine_settings").select("key, value");
    const settings: Record<string, any> = {};
    for (const row of data || []) settings[row.key] = row.value;
    return settings;
  }

  // Helper: check kill switch
  async function isKilled(): Promise<boolean> {
    const s = await getSettings();
    return s.kill_switch === true || s.kill_switch?.enabled === true;
  }

  try {
    // ─── INGEST POST (from Discord / external source) ───
    if (action === "ingest" && req.method === "POST") {
      const BOT_SECRET = Deno.env.get("BOT_SECRET") || "";
      const incomingSecret = req.headers.get("x-bot-secret") || "";
      if (!BOT_SECRET || incomingSecret !== BOT_SECRET) {
        return json({ error: "Unauthorized" }, 401);
      }

      const body = await req.json();
      const tweetUrl: string = body.tweet_url || "";
      const discordMsgId: string = body.discord_msg_id || "";
      const discordAuthor: string = body.discord_author || "unknown";

      if (!tweetUrl) return json({ error: "tweet_url required" }, 400);

      // Extract external post ID from URL: https://x.com/user/status/123456
      const statusMatch = tweetUrl.match(/\/status\/(\d+)/);
      const externalPostId = statusMatch?.[1] || null;

      // Extract author handle from URL: https://x.com/SomeUser/status/...
      const handleMatch = tweetUrl.match(/(?:x\.com|twitter\.com)\/([^\/\?]+)\/status/i);
      const authorHandle = handleMatch?.[1] || null;

      // Dedup: skip if this external_post_id already exists
      if (externalPostId) {
        const { data: existing } = await supabase
          .from("reply_engine_posts")
          .select("id")
          .eq("external_post_id", externalPostId)
          .limit(1);
        if (existing?.length) {
          return json({ ok: true, skipped: true, reason: "already_ingested", post_id: existing[0].id });
        }
      }

      // Fetch tweet text via X API if bearer token available
      let textContent = "";
      const TWITTER_BEARER = Deno.env.get("TWITTER_BEARER_TOKEN");
      if (externalPostId && TWITTER_BEARER) {
        try {
          const tRes = await fetch(
            `https://api.x.com/2/tweets/${externalPostId}?tweet.fields=text,author_id`,
            { headers: { Authorization: `Bearer ${TWITTER_BEARER}` } }
          );
          if (tRes.ok) {
            const tData = await tRes.json();
            textContent = tData?.data?.text || "";
          }
        } catch (e) {
          console.error("[reply-engine] X API fetch failed:", e);
        }
      }

      const { data: post, error: insertErr } = await supabase.from("reply_engine_posts").insert({
        platform: "x",
        external_post_id: externalPostId,
        post_url: tweetUrl,
        author_handle: authorHandle,
        text_content: textContent,
        category: "discord-ingested",
        status: "pending",
      }).select().single();

      if (insertErr) {
        console.error("[reply-engine] Insert error:", insertErr);
        return json({ error: insertErr.message }, 500);
      }

      await audit("post_ingested", "post", post.id, {
        source: "discord",
        discord_msg_id: discordMsgId,
        discord_author: discordAuthor,
        tweet_url: tweetUrl,
      });

      return json({ ok: true, post_id: post.id });
    }

    // ─── GENERATE REPLIES ───
    if (action === "generate" && req.method === "POST") {
      const { post_id } = await req.json();
      if (!post_id) return json({ error: "post_id required" }, 400);

      const { data: post } = await supabase.from("reply_engine_posts").select("*").eq("id", post_id).single();
      if (!post) return json({ error: "Post not found" }, 404);

      const settings = await getSettings();
      const brandVoice = settings.brand_voice || "Professional, witty, crypto-native";
      const tonePreset = settings.tone_preset || "balanced";
      const ctaEnabled = settings.cta_enabled === true;
      const ctaText = settings.cta_text || "";

      const variants = [
        { name: "concise", tone: "concise", instruction: "Keep it under 60 characters. Punchy, direct, no fluff." },
        { name: "insightful", tone: "insightful", instruction: "Add genuine value — a stat, counter-point, or fresh angle. 100-180 chars." },
        { name: "promotional", tone: "brand-safe promotional", instruction: `Engage with the content naturally, then weave in a subtle promotional hook.${ctaEnabled && ctaText ? ` Include CTA: ${ctaText}` : ""}` },
      ];

      const systemPrompt = `You are a social media reply specialist. Brand voice: ${brandVoice}. Tone preset: ${tonePreset}.

Rules:
- Reply must be relevant to the original post content
- Never generate hate, threats, harassment, abuse, deception, impersonation, or spam
- Avoid repetitive generic filler
- Keep replies social-friendly and natural
- Write ONLY the reply text, nothing else
- Do NOT wrap in quotes`;

      const suggestions: any[] = [];

      for (const variant of variants) {
        try {
          const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash-lite",
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: `Original post by @${post.author_handle || "unknown"}:\n"${post.text_content || ""}"\n\nWrite a ${variant.tone} reply. ${variant.instruction}` },
              ],
              temperature: 1.0,
            }),
          });

          const data = await res.json();
          let reply = data.choices?.[0]?.message?.content?.trim() || "";
          reply = reply.replace(/^["']|["']$/g, "").trim();

          const { data: inserted } = await supabase.from("reply_suggestions").insert({
            post_id,
            variant_name: variant.name,
            suggested_reply: reply || `Great take on this 🔥`,
            tone: variant.tone,
            model_name: "gemini-2.5-flash-lite",
            generation_status: reply ? "generated" : "fallback",
          }).select().single();

          suggestions.push(inserted);
        } catch (e) {
          console.error(`[reply-engine] Generation error for ${variant.name}:`, e);
          const { data: inserted } = await supabase.from("reply_suggestions").insert({
            post_id,
            variant_name: variant.name,
            suggested_reply: "Great take on this 🔥",
            tone: variant.tone,
            model_name: "gemini-2.5-flash-lite",
            generation_status: "error",
          }).select().single();
          suggestions.push(inserted);
        }
      }

      // Create a review record
      await supabase.from("reply_reviews").insert({
        post_id,
        status: "needs_review",
      });

      // Update post status
      await supabase.from("reply_engine_posts").update({ status: "suggestions_ready" }).eq("id", post_id);

      await audit("reply_generated", "post", post_id, { suggestion_count: suggestions.length });

      return json({ ok: true, suggestions });
    }

    // ─── APPROVE REVIEW ───
    if (action === "approve" && req.method === "POST") {
      const { review_id } = await req.json();
      if (!review_id) return json({ error: "review_id required" }, 400);

      await supabase.from("reply_reviews").update({
        status: "approved",
        reviewed_at: new Date().toISOString(),
      }).eq("id", review_id);

      await audit("reply_approved", "review", review_id);
      return json({ ok: true });
    }

    // ─── REJECT REVIEW ───
    if (action === "reject" && req.method === "POST") {
      const { review_id, notes } = await req.json();
      if (!review_id) return json({ error: "review_id required" }, 400);

      await supabase.from("reply_reviews").update({
        status: "rejected",
        review_notes: notes || null,
        reviewed_at: new Date().toISOString(),
      }).eq("id", review_id);

      // Update post status
      const { data: review } = await supabase.from("reply_reviews").select("post_id").eq("id", review_id).single();
      if (review) await supabase.from("reply_engine_posts").update({ status: "rejected" }).eq("id", review.post_id);

      await audit("reply_rejected", "review", review_id, { notes });
      return json({ ok: true });
    }

    // ─── SAVE EDIT ───
    if (action === "save-edit" && req.method === "POST") {
      const { review_id, edited_reply, selected_suggestion_id } = await req.json();
      if (!review_id) return json({ error: "review_id required" }, 400);

      await supabase.from("reply_reviews").update({
        edited_reply: edited_reply || null,
        selected_reply_suggestion_id: selected_suggestion_id || null,
      }).eq("id", review_id);

      await audit("reply_edited", "review", review_id, { edited_reply: edited_reply?.substring(0, 100) });
      return json({ ok: true });
    }

    // ─── SEND REPLY ───
    if (action === "send" && req.method === "POST") {
      if (await isKilled()) return json({ error: "System is disabled via kill switch" }, 403);

      const { review_id, account_id } = await req.json();
      if (!review_id || !account_id) return json({ error: "review_id and account_id required" }, 400);

      // Get review
      const { data: review } = await supabase.from("reply_reviews").select("*, reply_engine_posts(*)").eq("id", review_id).single();
      if (!review) return json({ error: "Review not found" }, 404);
      if (review.status !== "approved") return json({ error: "Reply must be approved before sending" }, 400);

      // Get account
      const { data: account } = await supabase.from("outbound_accounts").select("*").eq("id", account_id).single();
      if (!account) return json({ error: "Account not found" }, 404);
      if (!account.is_authorized) return json({ error: "Account is not authorized for sending" }, 403);

      // Check daily limit
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { count } = await supabase.from("outbound_attempts")
        .select("id", { count: "exact", head: true })
        .eq("outbound_account_id", account_id)
        .eq("status", "sent")
        .gte("attempted_at", todayStart.toISOString());

      if ((count || 0) >= account.daily_limit) {
        return json({ error: `Daily limit of ${account.daily_limit} reached for this account` }, 429);
      }

      const post = review.reply_engine_posts as any;
      const replyText = review.edited_reply || "";
      if (!replyText.trim()) return json({ error: "No reply text to send" }, 400);

      const externalPostId = post?.external_post_id;

      // Check if provider supports replies
      if (account.provider === "upload-post") {
        if (!externalPostId) {
          // No external_post_id — cannot reply, mark failed
          const { data: attempt } = await supabase.from("outbound_attempts").insert({
            reply_review_id: review_id,
            outbound_account_id: account_id,
            request_payload: { reply_text: replyText },
            response_payload: {},
            status: "failed",
            error_message: "Reply endpoint unavailable: no external_post_id on the original post",
          }).select().single();

          await audit("send_failed", "outbound_attempt", attempt?.id, { reason: "no_external_post_id" });
          return json({ ok: false, error: "Reply endpoint unavailable: no external post ID", attempt });
        }

        // Send via Upload-Post API
        const params = new URLSearchParams();
        params.append("user", account.account_identifier);
        params.append("platform[]", post?.platform || "x");
        params.append("title", replyText);
        params.append("reply_to_id", externalPostId);

        const requestPayload = {
          user: account.account_identifier,
          platform: post?.platform || "x",
          title: replyText,
          reply_to_id: externalPostId,
        };

        let uploadRes: Response;
        let uploadData: any = {};
        let uploadText = "";

        try {
          uploadRes = await fetch(`${API_BASE}/upload_text`, {
            method: "POST",
            headers: {
              "Authorization": `Apikey ${UPLOAD_POST_API_KEY}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: params.toString(),
          });
          uploadText = await uploadRes.text();
          try { uploadData = JSON.parse(uploadText); } catch {}
        } catch (e) {
          const { data: attempt } = await supabase.from("outbound_attempts").insert({
            reply_review_id: review_id,
            outbound_account_id: account_id,
            request_payload: requestPayload,
            response_payload: { error: String(e) },
            status: "failed",
            error_message: `Network error: ${String(e)}`,
          }).select().single();

          await audit("send_failed", "outbound_attempt", attempt?.id, { error: String(e) });
          return json({ ok: false, error: String(e), attempt });
        }

        const xResult = uploadData?.results?.x;
        const success = uploadData?.success === true && xResult?.success === true;
        const postId = xResult?.post_id || null;
        const replyUrl = xResult?.url || null;

        const { data: attempt } = await supabase.from("outbound_attempts").insert({
          reply_review_id: review_id,
          outbound_account_id: account_id,
          request_payload: requestPayload,
          response_payload: uploadData,
          provider_message_id: postId,
          status: success ? "sent" : "failed",
          error_message: success ? null : (xResult?.error || uploadText.substring(0, 300)),
        }).select().single();

        if (success) {
          await supabase.from("reply_reviews").update({ status: "sent" }).eq("id", review_id);
          await supabase.from("reply_engine_posts").update({ status: "replied" }).eq("id", post?.id);
          await audit("send_success", "outbound_attempt", attempt?.id, { post_id: postId, url: replyUrl });
        } else {
          await audit("send_failed", "outbound_attempt", attempt?.id, { error: xResult?.error });
        }

        return json({ ok: success, attempt, reply_url: replyUrl });
      }

      // Unsupported provider
      return json({ error: `Provider '${account.provider}' not supported` }, 400);
    }

    // ─── GET QUEUE ───
    if (action === "queue") {
      const { data } = await supabase.from("reply_engine_posts")
        .select("*, reply_reviews(*), reply_suggestions(*)")
        .in("status", ["pending", "suggestions_ready", "needs_review"])
        .order("created_at", { ascending: false })
        .limit(100);
      return json({ posts: data || [] });
    }

    // ─── GET ALL POSTS ───
    if (action === "posts") {
      const status = url.searchParams.get("status");
      let query = supabase.from("reply_engine_posts")
        .select("*, reply_reviews(*), reply_suggestions(*)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (status) query = query.eq("status", status);
      const { data } = await query;
      return json({ posts: data || [] });
    }

    // ─── GET SINGLE POST DETAIL ───
    if (action === "post-detail") {
      const postId = url.searchParams.get("post_id");
      if (!postId) return json({ error: "post_id required" }, 400);
      const { data } = await supabase.from("reply_engine_posts")
        .select("*, reply_reviews(*), reply_suggestions(*)")
        .eq("id", postId).single();
      return json({ post: data });
    }

    // ─── GET SENT REPLIES ───
    if (action === "sent") {
      const { data } = await supabase.from("outbound_attempts")
        .select("*, reply_reviews(*, reply_engine_posts(*)), outbound_accounts(*)")
        .order("attempted_at", { ascending: false })
        .limit(100);
      return json({ attempts: data || [] });
    }

    // ─── GET ACCOUNTS ───
    if (action === "accounts") {
      const { data } = await supabase.from("outbound_accounts").select("*").order("created_at", { ascending: false });
      return json({ accounts: data || [] });
    }

    // ─── GET SETTINGS ───
    if (action === "settings") {
      const settings = await getSettings();
      return json({ settings });
    }

    // ─── UPDATE SETTINGS ───
    if (action === "update-settings" && req.method === "POST") {
      const body = await req.json();
      for (const [key, value] of Object.entries(body)) {
        await supabase.from("reply_engine_settings").upsert({
          key,
          value: value as any,
          updated_at: new Date().toISOString(),
        }, { onConflict: "key" });
      }
      await audit("settings_updated", "settings", "global", body);
      return json({ ok: true });
    }

    // ─── GET AUDIT LOGS ───
    if (action === "audit-logs") {
      const limit = parseInt(url.searchParams.get("limit") || "100");
      const { data } = await supabase.from("reply_engine_audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      return json({ logs: data || [] });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    console.error("[reply-engine] Error:", err);
    return json({ error: String(err) }, 500);
  }
});

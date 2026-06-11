// Fetches IG DM conversations from Upload-Post and (optionally) sends replies.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const API_BASE = "https://api.upload-post.com/api";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("UPLOAD_POST_API_KEY");
    if (!apiKey) throw new Error("UPLOAD_POST_API_KEY not configured");

    const url = new URL(req.url);
    const action = url.searchParams.get("action");
    const user = url.searchParams.get("user") || "unc86";

    // List available Upload-Post profiles
    if (req.method === "GET" && action === "profiles") {
      const pRes = await fetch(`${API_BASE}/uploadposts/users`, {
        headers: { Authorization: `Apikey ${apiKey}` },
      });
      const pText = await pRes.text();
      if (!pRes.ok) {
        return new Response(JSON.stringify({ error: pText }), {
          status: pRes.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const parsed = JSON.parse(pText);
      const raw = Array.isArray(parsed) ? parsed
        : Array.isArray(parsed?.profiles) ? parsed.profiles
        : Array.isArray(parsed?.users) ? parsed.users
        : [];
      const profiles = raw.map((p: any) => ({
        username: String(p?.username || p?.user || "").trim(),
        instagram: p?.social_accounts?.instagram?.username || p?.instagram?.username || null,
      })).filter((p: any) => p.username);
      return new Response(JSON.stringify({ success: true, profiles }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST = send reply
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const { recipient_id, message } = body || {};
      if (!recipient_id || !message) {
        return new Response(
          JSON.stringify({ error: "recipient_id and message are required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const form = new FormData();
      form.append("user", user);
      form.append("platform", "instagram");
      form.append("recipient_id", String(recipient_id));
      form.append("message", String(message));

      const sendRes = await fetch(`${API_BASE}/uploadposts/dms/send`, {
        method: "POST",
        headers: { Authorization: `Apikey ${apiKey}` },
        body: form,
      });
      const sendData = await sendRes.json().catch(() => ({}));
      return new Response(JSON.stringify(sendData), {
        status: sendRes.ok ? 200 : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // GET = list conversations
    const convRes = await fetch(
      `${API_BASE}/uploadposts/dms/conversations?platform=instagram&user=${encodeURIComponent(user)}`,
      { headers: { Authorization: `Apikey ${apiKey}` } }
    );
    const convData = await convRes.json();
    if (!convRes.ok) {
      return new Response(JSON.stringify({ error: convData }), {
        status: convRes.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const conversations: any[] = convData.conversations || convData || [];
    const myUsername = "unc_86";

    const normalized = conversations.map((conv: any) => {
      const participants = conv.participants?.data || [];
      const messages = conv.messages?.data || [];
      const other = participants.find((p: any) => p.username !== myUsername) || participants[0] || {};

      const msgs = messages.map((m: any) => {
        const fromUsername = m.from?.username || "";
        const isInbound = fromUsername !== myUsername;
        const att = m.attachments?.data?.[0];
        const attachmentUrl =
          att?.url ||
          att?.video_data?.url ||
          att?.image_data?.url ||
          m.shares?.data?.[0]?.link ||
          m.story?.url ||
          "";
        return {
          id: m.id,
          from: fromUsername,
          direction: isInbound ? "inbound" : "outbound",
          text: m.message || m.text || "",
          attachment_url: attachmentUrl || null,
          created_time: m.created_time || null,
        };
      }).sort((a: any, b: any) => {
        const ta = a.created_time ? new Date(a.created_time).getTime() : 0;
        const tb = b.created_time ? new Date(b.created_time).getTime() : 0;
        return ta - tb;
      });

      const last = msgs[msgs.length - 1];
      return {
        conversation_id: conv.id,
        other_username: other.username || "unknown",
        other_id: other.id || "",
        updated_time: conv.updated_time || last?.created_time || null,
        message_count: msgs.length,
        last_message: last || null,
        messages: msgs,
      };
    }).sort((a: any, b: any) => {
      const ta = a.updated_time ? new Date(a.updated_time).getTime() : 0;
      const tb = b.updated_time ? new Date(b.updated_time).getTime() : 0;
      return tb - ta;
    });

    return new Response(
      JSON.stringify({ success: true, user, conversations: normalized }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("ig-dm-fetch error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

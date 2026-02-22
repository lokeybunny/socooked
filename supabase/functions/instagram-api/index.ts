// ManyChat-powered Instagram DM integration
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MC_API = "https://api.manychat.com/fb";

async function mcFetch(path: string, token: string, method = "GET", body?: any) {
  const opts: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${MC_API}${path}`, opts);
  const data = await res.json();
  if (!res.ok || data.status === "error") {
    console.error("ManyChat error:", JSON.stringify(data));
    throw new Error(data.message || data.error || `ManyChat API error: ${res.status}`);
  }
  return data;
}

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const token = Deno.env.get("MANYCHAT_API_KEY");
    if (!token) throw new Error("MANYCHAT_API_KEY not configured");

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // ─── Webhook: ManyChat sends incoming messages here ───
    if (action === "webhook") {
      const payload = await req.json();
      console.log("ManyChat webhook payload:", JSON.stringify(payload));

      const sb = getSupabaseAdmin();
      const subscriberId = payload.subscriber_id || payload.id || "";
      const subscriberName =
        payload.name || (payload.first_name
          ? `${payload.first_name || ""} ${payload.last_name || ""}`.trim()
          : "Unknown");
      const messageText = payload.last_input_text || payload.text || payload.message || "";
      const igUsername = payload.ig_username || payload.username || "";

      if (messageText) {
        await sb.from("communications").insert({
          type: "instagram",
          direction: "inbound",
          from_address: igUsername || subscriberName,
          body: messageText,
          provider: "manychat",
          external_id: String(subscriberId),
          status: "received",
          metadata: { manychat_subscriber_id: subscriberId, ig_username: igUsername, raw: payload },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Get conversations from stored messages ───
    if (action === "conversations") {
      const sb = getSupabaseAdmin();
      const { data: convos, error } = await sb
        .from("communications")
        .select("*")
        .eq("type", "instagram")
        .eq("provider", "manychat")
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw new Error(error.message);

      const grouped: Record<string, any> = {};
      for (const msg of convos || []) {
        const key = msg.external_id || msg.from_address || msg.to_address || "unknown";
        if (!grouped[key]) {
          const meta = (msg.metadata || {}) as any;
          grouped[key] = {
            id: key,
            participantUsername: meta?.ig_username || msg.from_address || msg.to_address || "unknown",
            participantId: key,
            lastMessage: msg.body || "",
            lastMessageTime: msg.created_at,
            messages: [],
          };
        }
        grouped[key].messages.push({
          id: msg.id,
          fromUsername: msg.direction === "inbound" ? (msg.from_address || "them") : "you",
          fromId: msg.direction === "inbound" ? key : "me",
          text: msg.body || "",
          createdTime: msg.created_at,
          isFromMe: msg.direction === "outbound",
        });
      }

      const conversations = Object.values(grouped);
      return new Response(JSON.stringify({ conversations }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Get messages for a specific subscriber ───
    if (action === "messages") {
      const subscriberId = url.searchParams.get("subscriber_id");
      if (!subscriberId) throw new Error("subscriber_id required");

      const sb = getSupabaseAdmin();
      const { data: msgs, error } = await sb
        .from("communications")
        .select("*")
        .eq("type", "instagram")
        .eq("provider", "manychat")
        .or(`external_id.eq.${subscriberId},to_address.eq.${subscriberId}`)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw new Error(error.message);

      const messages = (msgs || []).map((m: any) => ({
        id: m.id,
        fromUsername: m.direction === "inbound" ? (m.from_address || "them") : "you",
        fromId: m.direction === "inbound" ? subscriberId : "me",
        text: m.body || "",
        createdTime: m.created_at,
        isFromMe: m.direction === "outbound",
      }));

      return new Response(JSON.stringify({ messages }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Send message via ManyChat ───
    if (action === "send") {
      const { subscriber_id, message } = await req.json();
      if (!subscriber_id || !message) throw new Error("subscriber_id and message required");

      const result = await mcFetch("/sending/sendContent", token, "POST", {
        subscriber_id: Number(subscriber_id),
        data: {
          version: "v2",
          content: {
            messages: [{ type: "text", text: message }],
          },
        },
      });

      const sb = getSupabaseAdmin();
      await sb.from("communications").insert({
        type: "instagram",
        direction: "outbound",
        to_address: String(subscriber_id),
        body: message,
        provider: "manychat",
        external_id: String(subscriber_id),
        status: "sent",
        metadata: { manychat_subscriber_id: subscriber_id },
      });

      return new Response(JSON.stringify({ success: true, ...result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Search subscriber by name ───
    if (action === "find") {
      const name = url.searchParams.get("name");
      if (!name) throw new Error("name required");
      const result = await mcFetch(`/subscriber/findByName?name=${encodeURIComponent(name)}`, token);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Get subscriber info ───
    if (action === "subscriber") {
      const subscriberId = url.searchParams.get("subscriber_id");
      if (!subscriberId) throw new Error("subscriber_id required");
      const result = await mcFetch(`/subscriber/getInfo?subscriber_id=${subscriberId}`, token);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ error: "Unknown action. Use ?action=conversations|messages|send|webhook|find|subscriber" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Instagram/ManyChat API error:", e);
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

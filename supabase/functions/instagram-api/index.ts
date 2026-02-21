// ManyChat-powered Instagram DM integration — Full Swagger API coverage
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
    const msg = data.message || data.error || `ManyChat API error: ${res.status}`;
    const err = new Error(msg) as any;
    err.mcStatus = res.status;
    err.mcDetails = data.details;
    throw err;
  }
  return data;
}

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

function jsonOk(body: any) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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

      return jsonOk({ success: true });
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

      return jsonOk({ conversations: Object.values(grouped) });
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

      return jsonOk({ messages });
    }

    // ─── Send message via ManyChat (POST /fb/sending/sendContent) ───
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

      return jsonOk({ success: true, ...result });
    }

    // ─── Send flow/automation to subscriber (POST /fb/sending/sendFlow) ───
    if (action === "send-flow") {
      const { subscriber_id, flow_ns } = await req.json();
      if (!subscriber_id || !flow_ns) throw new Error("subscriber_id and flow_ns required");

      const result = await mcFetch("/sending/sendFlow", token, "POST", {
        subscriber_id: Number(subscriber_id),
        flow_ns,
      });

      return jsonOk({ success: true, ...result });
    }

    // ─── Search subscriber by name (GET /fb/subscriber/findByName) ───
    if (action === "find") {
      const name = url.searchParams.get("name");
      if (!name) throw new Error("name required");
      const result = await mcFetch(`/subscriber/findByName?name=${encodeURIComponent(name)}`, token);
      return jsonOk(result);
    }

    // ─── Search subscriber by system field (GET /fb/subscriber/findBySystemField) ───
    if (action === "find-by-field") {
      const field_name = url.searchParams.get("field_name");
      const field_value = url.searchParams.get("field_value");
      if (!field_name || !field_value) throw new Error("field_name and field_value required");
      const result = await mcFetch(
        `/subscriber/findBySystemField?field_name=${encodeURIComponent(field_name)}&field_value=${encodeURIComponent(field_value)}`,
        token
      );
      return jsonOk(result);
    }

    // ─── Search subscriber by custom field (GET /fb/subscriber/findByCustomField) ───
    if (action === "find-by-custom-field") {
      const field_id = url.searchParams.get("field_id");
      const field_value = url.searchParams.get("field_value");
      if (!field_id || !field_value) throw new Error("field_id and field_value required");
      const result = await mcFetch(
        `/subscriber/findByCustomField?field_id=${encodeURIComponent(field_id)}&field_value=${encodeURIComponent(field_value)}`,
        token
      );
      return jsonOk(result);
    }

    // ─── Get subscriber info (GET /fb/subscriber/getInfo) ───
    if (action === "subscriber") {
      const subscriberId = url.searchParams.get("subscriber_id");
      if (!subscriberId) throw new Error("subscriber_id required");
      const result = await mcFetch(`/subscriber/getInfo?subscriber_id=${subscriberId}`, token);
      return jsonOk(result);
    }

    // ─── Create subscriber (POST /fb/subscriber/createSubscriber) ───
    if (action === "create-subscriber") {
      const body = await req.json();
      const result = await mcFetch("/subscriber/createSubscriber", token, "POST", body);
      return jsonOk(result);
    }

    // ─── Update subscriber (POST /fb/subscriber/updateSubscriber) ───
    if (action === "update-subscriber") {
      const body = await req.json();
      const result = await mcFetch("/subscriber/updateSubscriber", token, "POST", body);
      return jsonOk(result);
    }

    // ─── Add tag to subscriber (POST /fb/subscriber/addTagByName) ───
    if (action === "add-tag") {
      const { subscriber_id, tag_name } = await req.json();
      if (!subscriber_id || !tag_name) throw new Error("subscriber_id and tag_name required");
      const result = await mcFetch("/subscriber/addTagByName", token, "POST", {
        subscriber_id: Number(subscriber_id),
        tag_name,
      });
      return jsonOk({ success: true, ...result });
    }

    // ─── Remove tag from subscriber (POST /fb/subscriber/removeTagByName) ───
    if (action === "remove-tag") {
      const { subscriber_id, tag_name } = await req.json();
      if (!subscriber_id || !tag_name) throw new Error("subscriber_id and tag_name required");
      const result = await mcFetch("/subscriber/removeTagByName", token, "POST", {
        subscriber_id: Number(subscriber_id),
        tag_name,
      });
      return jsonOk({ success: true, ...result });
    }

    // ─── Set custom field on subscriber (POST /fb/subscriber/setCustomFieldByName) ───
    if (action === "set-custom-field") {
      const { subscriber_id, field_name, field_value } = await req.json();
      if (!subscriber_id || !field_name) throw new Error("subscriber_id and field_name required");
      const result = await mcFetch("/subscriber/setCustomFieldByName", token, "POST", {
        subscriber_id: Number(subscriber_id),
        field_name,
        field_value: field_value ?? "",
      });
      return jsonOk({ success: true, ...result });
    }

    // ─── Page Info (GET /fb/page/getInfo) ───
    if (action === "page-info") {
      const result = await mcFetch("/page/getInfo", token);
      return jsonOk(result);
    }

    // ─── Get all tags (GET /fb/page/getTags) ───
    if (action === "tags") {
      const result = await mcFetch("/page/getTags", token);
      return jsonOk(result);
    }

    // ─── Create tag (POST /fb/page/createTag) ───
    if (action === "create-tag") {
      const { name } = await req.json();
      if (!name) throw new Error("name required");
      const result = await mcFetch("/page/createTag", token, "POST", { name });
      return jsonOk({ success: true, ...result });
    }

    // ─── Remove tag (POST /fb/page/removeTagByName) ───
    if (action === "delete-tag") {
      const { tag_name } = await req.json();
      if (!tag_name) throw new Error("tag_name required");
      const result = await mcFetch("/page/removeTagByName", token, "POST", { tag_name });
      return jsonOk({ success: true, ...result });
    }

    // ─── Get all flows (GET /fb/page/getFlows) ───
    if (action === "flows") {
      const result = await mcFetch("/page/getFlows", token);
      return jsonOk(result);
    }

    // ─── Get growth tools/widgets (GET /fb/page/getWidgets) ───
    if (action === "widgets") {
      const result = await mcFetch("/page/getWidgets", token);
      return jsonOk(result);
    }

    // ─── Get custom fields (GET /fb/page/getCustomFields) ───
    if (action === "custom-fields") {
      const result = await mcFetch("/page/getCustomFields", token);
      return jsonOk(result);
    }

    // ─── Get bot fields (GET /fb/page/getBotFields) ───
    if (action === "bot-fields") {
      const result = await mcFetch("/page/getBotFields", token);
      return jsonOk(result);
    }

    // ─── Set bot field (POST /fb/page/setBotFieldByName) ───
    if (action === "set-bot-field") {
      const { field_name, field_value } = await req.json();
      if (!field_name) throw new Error("field_name required");
      const result = await mcFetch("/page/setBotFieldByName", token, "POST", {
        field_name,
        field_value: field_value ?? "",
      });
      return jsonOk({ success: true, ...result });
    }

    // ─── Get OTN topics (GET /fb/page/getOtnTopics) ───
    if (action === "otn-topics") {
      const result = await mcFetch("/page/getOtnTopics", token);
      return jsonOk(result);
    }

    // ─── Get growth tools (GET /fb/page/getGrowthTools) ───
    if (action === "growth-tools") {
      const result = await mcFetch("/page/getGrowthTools", token);
      return jsonOk(result);
    }

    return new Response(
      JSON.stringify({
        error: "Unknown action",
        available_actions: [
          "webhook", "conversations", "messages", "send", "send-flow",
          "find", "find-by-field", "find-by-custom-field",
          "subscriber", "create-subscriber", "update-subscriber",
          "add-tag", "remove-tag", "set-custom-field",
          "page-info", "tags", "create-tag", "delete-tag",
          "flows", "widgets", "custom-fields", "bot-fields",
          "set-bot-field", "otn-topics", "growth-tools",
        ],
      }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Instagram/ManyChat API error:", e);
    const status = (e as any).mcDetails ? 422 : 500;
    return new Response(
      JSON.stringify({ error: e.message, details: (e as any).mcDetails || null }),
      { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

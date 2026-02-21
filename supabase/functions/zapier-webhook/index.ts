import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    let payload: any;
    const contentType = req.headers.get("content-type") || "";
    
    if (contentType.includes("application/json")) {
      payload = await req.json();
    } else if (contentType.includes("application/x-www-form-urlencoded")) {
      const text = await req.text();
      const params = new URLSearchParams(text);
      payload = Object.fromEntries(params.entries());
    } else {
      // Try JSON first, fall back to form-encoded
      const text = await req.text();
      try {
        payload = JSON.parse(text);
      } catch {
        const params = new URLSearchParams(text);
        payload = Object.fromEntries(params.entries());
      }
    }

    console.log("Zapier webhook received:", JSON.stringify(payload));

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Flexible field mapping — accepts ManyChat fields or custom Zapier fields
    const subscriberId = payload.subscriber_id || payload.id || payload.user_id || "";
    const name = payload.name || payload.full_name ||
      [payload.first_name, payload.last_name].filter(Boolean).join(" ") || "Unknown";
    const message = payload.last_input_text || payload.text || payload.message || payload.body || "";
    const igUsername = payload.ig_username || payload.username || payload.instagram_handle || "";
    const channel = payload.channel || "instagram";

    if (!message) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: "No message text" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error } = await supabase.from("communications").insert({
      type: channel,
      direction: "inbound",
      from_address: igUsername || name,
      body: message,
      provider: "manychat",
      external_id: String(subscriberId),
      status: "received",
      metadata: {
        source: "zapier",
        manychat_subscriber_id: subscriberId,
        ig_username: igUsername,
        subscriber_name: name,
        raw: payload,
      },
    });

    if (error) throw new Error(error.message);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Zapier webhook error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

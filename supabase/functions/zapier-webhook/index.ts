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

    // Flexible field mapping — accepts ManyChat/Zapier fields with user__ prefix or flat
    const p = payload;
    const subscriberId = p.subscriber_id || p.user__id || p.id || p.user_id || "";
    const name = p.name || p.user__name || p.full_name ||
      [p.first_name || p.user__first_name, p.last_name || p.user__last_name].filter(Boolean).join(" ") || "Unknown";
    const message = p.last_input_text || p.user__last_input_text || p.text || p.message || p.body || "";
    const igUsername = p.ig_username || p.user__ig_username || p.username || p.instagram_handle || "";
    const channel = p.channel || "instagram";

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

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const WEBHOOK_URL =
  "https://discord.com/api/webhooks/1496195405199835388/TSjesn8TtD3RV6TJtcWXT7UyfXJ4mkmo3jFRXhUbaC_bIhj5lBsXPn0CUWTVYiSjM__F";
const MENTION_USER_ID = "1044533644347330580"; // @uncle Warren | Da Guru

const CATEGORY_META: Record<string, { label: string; emoji: string; color: number }> = {
  web: { label: "Web Design", emoji: "💻", color: 0x3b82f6 },
  webdesign: { label: "Web Design", emoji: "💻", color: 0x3b82f6 },
  video: { label: "Videography", emoji: "🎬", color: 0xa855f7 },
  videography: { label: "Videography", emoji: "🎬", color: 0xa855f7 },
  seller: { label: "Home Seller", emoji: "🏠", color: 0x22c55e },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const {
      category,
      name,
      email,
      phone,
      business,
      eventType,
      address,
      message,
      notes,
      extra,
    } = body || {};

    if (!category || !name) {
      return new Response(
        JSON.stringify({ error: "category and name are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const meta = CATEGORY_META[String(category).toLowerCase()] || {
      label: String(category),
      emoji: "📩",
      color: 0x64748b,
    };

    const fields: Array<{ name: string; value: string; inline?: boolean }> = [
      { name: "Name", value: String(name), inline: true },
      { name: "Category", value: `${meta.emoji} ${meta.label}`, inline: true },
    ];
    if (phone) fields.push({ name: "Phone", value: String(phone), inline: true });
    if (email) fields.push({ name: "Email", value: String(email), inline: true });
    if (business) fields.push({ name: "Business", value: String(business), inline: true });
    if (eventType) fields.push({ name: "Event Type", value: String(eventType), inline: true });
    if (address) fields.push({ name: "Address", value: String(address), inline: false });
    if (message) fields.push({ name: "Message", value: String(message).slice(0, 1024), inline: false });
    if (notes) fields.push({ name: "Notes", value: String(notes).slice(0, 1024), inline: false });
    if (extra && typeof extra === "object") {
      for (const [k, v] of Object.entries(extra)) {
        if (v == null || v === "") continue;
        fields.push({ name: String(k), value: String(v).slice(0, 1024), inline: false });
      }
    }

    const payload = {
      content: `<@${MENTION_USER_ID}> 🚨 New **${meta.label}** lead just came in!`,
      allowed_mentions: { users: [MENTION_USER_ID] },
      embeds: [
        {
          title: `${meta.emoji} New Lead — ${meta.label}`,
          description: `**${name}** just submitted the ${meta.label} funnel.`,
          color: meta.color,
          fields,
          timestamp: new Date().toISOString(),
          footer: { text: "Warren Guru • Funnel Lead" },
        },
      ],
    };

    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("[discord-lead-notify] webhook error", res.status, text);
      return new Response(
        JSON.stringify({ error: "Discord webhook failed", status: res.status, details: text }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[discord-lead-notify] error:", err?.message || err);
    return new Response(JSON.stringify({ error: err?.message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

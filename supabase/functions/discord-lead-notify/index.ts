import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const WEBHOOK_URL =
  "https://discord.com/api/webhooks/1496195405199835388/TSjesn8TtD3RV6TJtcWXT7UyfXJ4mkmo3jFRXhUbaC_bIhj5lBsXPn0CUWTVYiSjM__F";
const MENTION_USER_ID = "1044533644347330580"; // @uncle Warren | Da Guru

const SUPABASE_URL =
  Deno.env.get("SUPABASE_URL") || "https://mziuxsfxevjnmdwnrqjs.supabase.co";
const APP_BASE = "https://stu25.com";

const CATEGORY_META: Record<string, { label: string; emoji: string; color: number }> = {
  web: { label: "Web Design", emoji: "💻", color: 0x3b82f6 },
  webdesign: { label: "Web Design", emoji: "💻", color: 0x3b82f6 },
  video: { label: "Videography", emoji: "🎬", color: 0xa855f7 },
  videography: { label: "Videography", emoji: "🎬", color: 0xa855f7 },
  seller: { label: "Home Seller", emoji: "🏠", color: 0x22c55e },
};

// Discord component types
const COMPONENT_ACTION_ROW = 1;
const COMPONENT_BUTTON = 2;
const BUTTON_LINK = 5;

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
      // New optional fields for end-of-call notifications
      event,            // "call_started" | "call_ended" | "lead_submitted"
      customerId,       // CRM customer UUID for "View Notes" deep-link
      callId,           // vapi call id for transcript/recording downloads
      recordingUrl,     // direct vapi recording URL (fallback)
      transcriptText,   // optional inline transcript (truncated to fit Discord)
      summary,          // optional vapi summary
      duration,         // seconds
      disposition,      // call disposition string
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

    const isCallEnded = event === "call_ended";
    const isCallStarted = event === "call_started";

    const fields: Array<{ name: string; value: string; inline?: boolean }> = [
      { name: "Name", value: String(name), inline: true },
      { name: "Category", value: `${meta.emoji} ${meta.label}`, inline: true },
    ];
    if (phone) fields.push({ name: "Phone", value: String(phone), inline: true });
    if (email) fields.push({ name: "Email", value: String(email), inline: true });
    if (business) fields.push({ name: "Business", value: String(business), inline: true });
    if (eventType) fields.push({ name: "Event Type", value: String(eventType), inline: true });
    if (address) fields.push({ name: "Address", value: String(address), inline: false });

    // Call-specific fields
    if (typeof duration === "number" && duration > 0) {
      const m = Math.floor(duration / 60);
      const s = Math.round(duration % 60);
      fields.push({ name: "Duration", value: `${m}m ${s}s`, inline: true });
    }
    if (disposition) fields.push({ name: "Disposition", value: String(disposition), inline: true });
    if (summary) fields.push({ name: "Summary", value: String(summary).slice(0, 1024), inline: false });

    if (message) fields.push({ name: "Message", value: String(message).slice(0, 1024), inline: false });
    if (notes) fields.push({ name: "Notes", value: String(notes).slice(0, 1024), inline: false });

    // Inline preview of transcript (Discord embed field limit = 1024 chars)
    if (transcriptText) {
      const tt = String(transcriptText);
      const preview = tt.length > 1000 ? tt.slice(0, 1000) + "…" : tt;
      fields.push({
        name: "Transcript Preview",
        value: "```\n" + preview + "\n```",
        inline: false,
      });
    }

    if (extra && typeof extra === "object") {
      for (const [k, v] of Object.entries(extra)) {
        if (v == null || v === "") continue;
        fields.push({ name: String(k), value: String(v).slice(0, 1024), inline: false });
      }
    }

    // Build link buttons (Discord allows webhooks to send link-style buttons)
    const buttons: any[] = [];
    if (callId) {
      // Download full transcript as .txt
      buttons.push({
        type: COMPONENT_BUTTON,
        style: BUTTON_LINK,
        label: "📄 Download Transcript",
        url: `${SUPABASE_URL}/functions/v1/call-transcript?call_id=${encodeURIComponent(callId)}`,
      });
      // Direct recording link (prefer recordingUrl; fallback to redirect)
      const recHref = recordingUrl
        ? recordingUrl
        : `${SUPABASE_URL}/functions/v1/call-transcript?call_id=${encodeURIComponent(callId)}&include=recording`;
      buttons.push({
        type: COMPONENT_BUTTON,
        style: BUTTON_LINK,
        label: "🎧 Listen to Recording",
        url: recHref,
      });
    }
    if (customerId) {
      buttons.push({
        type: COMPONENT_BUTTON,
        style: BUTTON_LINK,
        label: "📒 View Caller Notes",
        url: `${APP_BASE}/customers?customer=${encodeURIComponent(customerId)}`,
      });
    }

    // Tailor headline based on event
    let titleEmoji = meta.emoji;
    let titleText = `New Lead — ${meta.label}`;
    let descText = `**${name}** just submitted the ${meta.label} funnel.`;
    let contentText = `<@${MENTION_USER_ID}> 🚨 New **${meta.label}** lead just came in!`;

    if (isCallStarted) {
      titleEmoji = "📞";
      titleText = `Live Call — ${meta.label}`;
      descText = `**${name}** is on the ${meta.label} AI line right now.`;
      contentText = `<@${MENTION_USER_ID}> 🟢 LIVE **${meta.label}** call!`;
    } else if (isCallEnded) {
      titleEmoji = "✅";
      titleText = `Call Ended — ${meta.label}`;
      descText = `Call with **${name}** just wrapped. Recording & transcript are ready.`;
      contentText = `<@${MENTION_USER_ID}> 📞 **${meta.label}** call ended — review below.`;
    }

    const payload: any = {
      content: contentText,
      allowed_mentions: { users: [MENTION_USER_ID] },
      embeds: [
        {
          title: `${titleEmoji} ${titleText}`,
          description: descText,
          color: meta.color,
          fields,
          timestamp: new Date().toISOString(),
          footer: { text: "Warren Guru • Funnel" },
        },
      ],
    };

    if (buttons.length > 0) {
      // Discord allows up to 5 buttons per action row
      payload.components = [
        { type: COMPONENT_ACTION_ROW, components: buttons.slice(0, 5) },
      ];
    }

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

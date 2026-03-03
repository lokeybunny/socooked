import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ACTION_EMOJI: Record<string, string> = {
  created: "🟢",
  updated: "🔵",
  deleted: "🔴",
  moved: "🔀",
  sent: "📨",
  draft_saved: "📝",
  media_generated: "🎨",
  media_generation_failed: "❌",
};

const ENTITY_EMOJI: Record<string, string> = {
  customer: "👤",
  deal: "💰",
  project: "📁",
  task: "✅",
  board: "📋",
  card: "🃏",
  invoice: "🧾",
  document: "📄",
  signature: "✍️",
  thread: "💬",
  content: "📝",
  lead: "🎯",
  meeting: "📅",
  automation: "⚙️",
  template: "📑",
  communication: "📧",
  interaction: "🤝",
  transcription: "🎙️",
  bot_task: "🤖",
  list: "📃",
  label: "🏷️",
  checklist: "☑️",
  website: "🌐",
  email: "📧",
  "scheduled-email": "⏰",
  smm: "🍌",
  top_gainer: "🏆",
};

function formatMessage(entry: {
  entity_type: string;
  action: string;
  meta: any;
  created_at: string;
}): string {
  const actionEmoji = ACTION_EMOJI[entry.action] || "⚪";
  const entityEmoji = ENTITY_EMOJI[entry.entity_type] || "📌";
  const entity =
    entry.entity_type.charAt(0).toUpperCase() + entry.entity_type.slice(1);
  const name = entry.meta?.name || entry.meta?.title || "";
  const nameStr = name ? ` "${name}"` : "";
  const previewUrl = entry.meta?.preview_url || "";
  const editUrl = entry.meta?.edit_url || "";

  const now = new Date();
  const time = now.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "America/Los_Angeles",
  });

  // Support custom message override from meta
  const customMsg = entry.meta?.message;

  // Deal stage transition
  if (entry.entity_type === "deal" && entry.meta?.from_stage && entry.meta?.to_stage) {
    const customerName = entry.meta?.customer_name || "Unknown";
    const dealTitle = name || "Untitled Deal";
    const fromStage = entry.meta.from_stage.charAt(0).toUpperCase() + entry.meta.from_stage.slice(1);
    const toStage = entry.meta.to_stage.charAt(0).toUpperCase() + entry.meta.to_stage.slice(1);
    let msg = `${entityEmoji} *Deal Update*\n📋 "${dealTitle}"\n👤 Customer: *${customerName}*\n🔀 Stage: *${fromStage}* → *${toStage}*\n🕐 ${time} PST`;
    if (previewUrl) msg += `\n🔗 [Preview](${previewUrl})`;
    if (editUrl) msg += `\n✏️ [Edit](${editUrl})`;
    return msg;
  }

  // Email sent notification — special formatting
  if ((entry.entity_type === "email" || entry.entity_type === "scheduled-email") && entry.action === "sent") {
    return `📨 📧 *Email Sent*\n${nameStr ? `📋 ${nameStr}\n` : ""}🕐 ${time} PST`;
  }

  // SMM Media Generation — Nano Banana notifications
  if (entry.entity_type === "smm" && (entry.action === "media_generated" || entry.action === "media_generation_failed")) {
    const model = entry.meta?.model || "Nano Banana";
    const isCustom = entry.meta?.custom_references === true;
    const platform = entry.meta?.platform || "social";
    const date = entry.meta?.date || "";
    const mediaUrl = entry.meta?.media_url || "";
    const profile = entry.meta?.profile || "";

    if (entry.action === "media_generated") {
      let msg = `🍌 *${model}*\n${nameStr}\n📱 ${platform} • ${date}\n👤 Profile: *${profile}*`;
      if (isCustom) msg += `\n🖼️ Custom reference active`;
      msg += `\n🕐 ${time} PST`;
      if (mediaUrl) msg += `\n🔗 [View Asset](${mediaUrl})`;
      return msg;
    } else {
      return `❌ 🍌 *${model} Failed*\n${nameStr}\n📱 ${platform} • ${date}\n🕐 ${time} PST`;
    }
  }

  let msg = customMsg
    ? `${actionEmoji} ${entityEmoji} ${customMsg}\n🕐 ${time} PST`
    : `${actionEmoji} ${entityEmoji} *${entity}*${nameStr} was *${entry.action}*\n🕐 ${time} PST`;
  if (previewUrl) msg += `\n🔗 [Preview](${previewUrl})`;
  if (editUrl) msg += `\n✏️ [Edit](${editUrl})`;
  return msg;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const TELEGRAM_CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID");

    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
      console.error("Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID");
      return new Response(
        JSON.stringify({ error: "Telegram not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();

    // Support both direct payload and trigger-style { record: ... }
    const entry = body.record || body;

    if (!entry.entity_type || !entry.action) {
      return new Response(
        JSON.stringify({ error: "Invalid payload" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Skip nano_banana image completions — the telegram-media-listener already sends the photo
    if (entry.action === 'nano_banana_image_completed') {
      return new Response(
        JSON.stringify({ success: true, skipped: 'nano_banana handled by listener' }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── Check if Top Gainer alerts are muted ───
    if (entry.entity_type === "top_gainer") {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, serviceKey);
      const { data: muteRows } = await supabase.from("webhook_events")
        .select("payload")
        .eq("source", "telegram").eq("event_type", "top_gainer_mute")
        .limit(1);
      if (muteRows && muteRows.length > 0 && (muteRows[0].payload as any)?.muted === true) {
        console.log("[telegram-notify] Top Gainer alerts muted — skipping");
        return new Response(
          JSON.stringify({ success: true, skipped: "top_gainer_muted" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const message = formatMessage(entry);
    console.log(`[telegram-notify] entity=${entry.entity_type} action=${entry.action} message_preview=${message.substring(0, 80)}`);

    const telegramRes = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: message,
          parse_mode: "Markdown",
        }),
      }
    );

    const telegramData = await telegramRes.json();

    if (!telegramRes.ok) {
      console.error("Telegram API error:", telegramData);
      return new Response(
        JSON.stringify({ success: false, error: telegramData }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Forward top_gainer alerts to Discord TP8 webhook
    let discordSent = false;
    if (entry.entity_type === "top_gainer") {
      const discordWebhookUrl = Deno.env.get("DISCORD_TP8_WEBHOOK_URL");
      if (discordWebhookUrl) {
        try {
          const ca = entry.meta?.ca_address || "";
          const ticker = entry.meta?.ticker ? `$${entry.meta.ticker}` : "";
          const milestone = entry.meta?.milestone || "TP#8+";
          const discordMsg = ticker ? `${ca} ${ticker} ${milestone}` : `${ca} ${milestone}`;
          const discordRes = await fetch(discordWebhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: discordMsg }),
          });
          discordSent = discordRes.ok;
          console.log(`[telegram-notify] Discord TP8 sent: ${discordMsg}`);
        } catch (discordErr: any) {
          console.error("[telegram-notify] Discord webhook error:", discordErr.message);
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, discord_sent: discordSent }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("telegram-notify error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

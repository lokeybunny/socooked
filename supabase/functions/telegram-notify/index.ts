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
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const sb = supabaseUrl && serviceKey ? createClient(supabaseUrl, serviceKey) : null;

    if (!TELEGRAM_BOT_TOKEN) {
      console.error("Missing TELEGRAM_BOT_TOKEN");
      return new Response(
        JSON.stringify({ error: "Telegram bot token not configured" }),
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

    // Check if TP10 gains alerts are disabled
    if (entry.entity_type === "top_gainer" && sb) {
      const { data: toggle } = await sb
        .from('site_configs')
        .select('content')
        .eq('site_id', 'system')
        .eq('section', 'tp8_alerts')
        .single();
      if (toggle?.content?.enabled === false) {
        console.log('[telegram-notify] TP10 alerts disabled via /gains toggle');
        return new Response(
          JSON.stringify({ success: true, skipped: 'tp8_alerts_disabled' }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const explicitChatIds = new Set<string>();
    const inlineChatId = entry?.chat_id ?? entry?.meta?.chat_id;
    if (inlineChatId !== undefined && inlineChatId !== null) {
      explicitChatIds.add(String(inlineChatId));
    }
    if (Array.isArray(entry?.chat_ids)) {
      entry.chat_ids.forEach((chatId: unknown) => {
        if (chatId !== undefined && chatId !== null) explicitChatIds.add(String(chatId));
      });
    }
    if (Array.isArray(entry?.meta?.chat_ids)) {
      entry.meta.chat_ids.forEach((chatId: unknown) => {
        if (chatId !== undefined && chatId !== null) explicitChatIds.add(String(chatId));
      });
    }

    const targetChatIds = new Set<string>();
    if (TELEGRAM_CHAT_ID) targetChatIds.add(String(TELEGRAM_CHAT_ID));
    explicitChatIds.forEach((chatId) => targetChatIds.add(chatId));

    if (sb) {
      const { data: recentChatSessions } = await sb
        .from('webhook_events')
        .select('payload')
        .eq('source', 'telegram')
        .order('created_at', { ascending: false })
        .limit(10);

      recentChatSessions?.forEach((row: any) => {
        const chatId = row?.payload?.chat_id;
        if (chatId !== undefined && chatId !== null) {
          targetChatIds.add(String(chatId));
        }
      });
    }

    if (targetChatIds.size === 0) {
      console.error("No target Telegram chat IDs configured");
      return new Response(
        JSON.stringify({ error: "No Telegram chat IDs configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const message = formatMessage(entry);
    const targetList = Array.from(targetChatIds);
    console.log(`[telegram-notify] entity=${entry.entity_type} action=${entry.action} targets=${targetList.join(',')} message_preview=${message.substring(0, 80)}`);

    const telegramResults = await Promise.all(targetList.map(async (chatId) => {
      const telegramRes = await fetch(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: message,
            parse_mode: "Markdown",
          }),
        }
      );
      const telegramData = await telegramRes.json();
      return { chat_id: chatId, ok: telegramRes.ok, data: telegramData };
    }));

    const failedDeliveries = telegramResults.filter((r) => !r.ok);
    if (failedDeliveries.length === telegramResults.length) {
      console.error("Telegram API error (all deliveries failed):", failedDeliveries);
      return new Response(
        JSON.stringify({ success: false, error: failedDeliveries }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (failedDeliveries.length > 0) {
      console.error("Telegram API partial delivery failure:", failedDeliveries);
    }

    // Forward top_gainer alerts to Discord TP10 webhook
    let discordSent = false;
    if (entry.entity_type === "top_gainer") {
      const discordWebhookUrl = Deno.env.get("DISCORD_TP8_WEBHOOK_URL");
      if (discordWebhookUrl) {
        try {
          const ca = entry.meta?.ca_address || "";
          const discordMsg = ca;
          const discordRes = await fetch(discordWebhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: discordMsg }),
          });
          discordSent = discordRes.ok;
          console.log(`[telegram-notify] Discord TP10 sent: ${discordMsg}`);
        } catch (discordErr: any) {
          console.error("[telegram-notify] Discord webhook error:", discordErr.message);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        discord_sent: discordSent,
        sent_to: targetList,
        failed_deliveries: failedDeliveries.map((d) => ({ chat_id: d.chat_id, error: d.data })),
      }),
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

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

    const message = formatMessage(entry);

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

    // Auto-delete the notification after 10 seconds to keep the chat clean
    const messageId = telegramData.result?.message_id;
    if (messageId) {
      setTimeout(async () => {
        try {
          await fetch(
            `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteMessage`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                message_id: messageId,
              }),
            }
          );
        } catch (e) {
          console.error("Auto-delete failed:", e);
        }
      }, 10_000);
    }

    return new Response(
      JSON.stringify({ success: true }),
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

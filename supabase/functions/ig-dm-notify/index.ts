// Polls Upload-Post IG DMs and notifies Telegram for new inbound messages
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const API_BASE = "https://api.upload-post.com/api";

function sb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

async function sendTelegram(text: string) {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const chatId = Deno.env.get("TELEGRAM_CHAT_ID");
  if (!token || !chatId) {
    console.error("Telegram credentials missing");
    return;
  }
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });
  const body = await res.text();
  if (!res.ok) console.error("Telegram send error:", body);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("UPLOAD_POST_API_KEY");
    if (!apiKey) throw new Error("UPLOAD_POST_API_KEY not configured");

    const url = new URL(req.url);
    const user = url.searchParams.get("user") || "STU25";

    // 1. Fetch IG conversations from Upload-Post
    const convRes = await fetch(
      `${API_BASE}/uploadposts/dms/conversations?platform=instagram&user=${encodeURIComponent(user)}`,
      { headers: { Authorization: `Apikey ${apiKey}` } }
    );
    const convData = await convRes.json();
    if (!convRes.ok) throw new Error(`Upload-Post error: ${JSON.stringify(convData)}`);

    const conversations: any[] = convData.conversations || convData || [];
    if (!Array.isArray(conversations) || conversations.length === 0) {
      return new Response(JSON.stringify({ notified: 0, message: "No conversations" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = sb();

    // 2. Get already-notified message IDs from communications table
    const { data: existing } = await supabase
      .from("communications")
      .select("external_id")
      .eq("type", "instagram")
      .eq("provider", "upload-post-dm-notify");

    const notifiedIds = new Set((existing || []).map((r: any) => r.external_id));

    // 3. Get known customer IG handles from CRM
    const { data: customers } = await supabase
      .from("customers")
      .select("id, instagram_handle, full_name")
      .not("instagram_handle", "is", null);

    // Build a map of known handles -> { full_name, customer_id }
    const knownHandles = new Map<string, { full_name: string; customer_id: string }>();
    (customers || []).forEach((c: any) => {
      if (c.instagram_handle) {
        const handle = c.instagram_handle.replace(/^@/, "").toLowerCase();
        knownHandles.set(handle, { full_name: c.full_name || handle, customer_id: c.id });
      }
    });

    // 4. Find new messages from known customers and log ALL (inbound + outbound)
    let notified = 0;
    let logged = 0;
    let skippedUnknown = 0;
    const myUsername = "w4rr3nguru";

    for (const conv of conversations) {
      const participants = conv.participants?.data || [];
      const messages = conv.messages?.data || [];

      const other = participants.find((p: any) => p.username !== myUsername);
      const otherUsername = other?.username || "unknown";
      const participantId = other?.id || "";

      // Only process if the other participant is a known customer
      if (!knownHandles.has(otherUsername.toLowerCase())) {
        skippedUnknown += messages.length;
        continue;
      }
      const customer = knownHandles.get(otherUsername.toLowerCase())!;

      for (const msg of messages) {
        const msgId = msg.id;
        if (!msgId || notifiedIds.has(msgId)) continue;

        const fromUsername = msg.from?.username || "";
        const isInbound = fromUsername !== myUsername;
        const messageText = msg.message || msg.text || "";
        const createdTime = msg.created_time || "";

        // Extract attachment URL if present
        const att = msg.attachments?.data?.[0];
        const attachmentUrl = att?.url || att?.video_data?.url || att?.image_data?.url || 
          msg.shares?.data?.[0]?.link || msg.story?.url || "";

        // Skip messages with no content at all
        if (!messageText && !attachmentUrl) continue;

        const bodyText = messageText || (attachmentUrl ? `🔗 ${attachmentUrl}` : "(media)");

        // For INBOUND messages: send Telegram notification
        let telegramMessageId: number | null = null;
        if (isInbound) {
          const tgMsg =
            `📩 <b>New IG DM from @${otherUsername}</b> (${customer.full_name})\n\n` +
            `${bodyText}\n\n` +
            `🕐 ${createdTime ? new Date(createdTime).toLocaleString("en-US", { timeZone: "America/Los_Angeles" }) : "just now"}\n` +
            `<i>Reply to this message to respond via Instagram</i>`;

          const tgToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
          const tgChatId = Deno.env.get("TELEGRAM_CHAT_ID");

          if (tgToken && tgChatId) {
            const tgRes = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: tgChatId,
                text: tgMsg,
                parse_mode: "HTML",
                disable_web_page_preview: true,
              }),
            });
            const tgData = await tgRes.json();
            if (tgRes.ok && tgData.result?.message_id) {
              telegramMessageId = tgData.result.message_id;
            }
          }
          notified++;
        }

        // Log ALL messages (inbound + outbound) into communications with customer_id
        await supabase.from("communications").insert({
          type: "instagram",
          direction: isInbound ? "inbound" : "outbound",
          from_address: fromUsername,
          to_address: isInbound ? myUsername : otherUsername,
          body: bodyText,
          provider: "upload-post-dm-notify",
          external_id: msgId,
          status: isInbound ? "received" : "sent",
          customer_id: customer.customer_id,
          metadata: {
            ig_username: otherUsername,
            participant_id: participantId,
            telegram_message_id: telegramMessageId,
            created_time: createdTime,
            attachment_url: attachmentUrl || undefined,
            source: "ig-dm-notify",
          },
        });

        logged++;
        notifiedIds.add(msgId);
      }
    }

    return new Response(
      JSON.stringify({ success: true, notified, logged, skipped_unknown: skippedUnknown, total_conversations: conversations.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("ig-dm-notify error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

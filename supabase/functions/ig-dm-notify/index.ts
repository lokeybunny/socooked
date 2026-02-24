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
      .select("instagram_handle, full_name")
      .not("instagram_handle", "is", null);

    // Build a set of known handles (lowercase, stripped of @)
    const knownHandles = new Map<string, string>();
    (customers || []).forEach((c: any) => {
      if (c.instagram_handle) {
        const handle = c.instagram_handle.replace(/^@/, "").toLowerCase();
        knownHandles.set(handle, c.full_name || handle);
      }
    });

    // 4. Find new inbound messages from known customers and notify
    let notified = 0;
    let skippedUnknown = 0;
    const myUsername = "w4rr3nguru";

    for (const conv of conversations) {
      const participants = conv.participants?.data || [];
      const messages = conv.messages?.data || [];

      const other = participants.find((p: any) => p.username !== myUsername);
      const otherUsername = other?.username || "unknown";

      // Only notify if sender is a known customer
      if (!knownHandles.has(otherUsername.toLowerCase())) {
        skippedUnknown += messages.length;
        continue;
      }
      const customerName = knownHandles.get(otherUsername.toLowerCase())!;

      for (const msg of messages) {
        const msgId = msg.id;
        if (!msgId || notifiedIds.has(msgId)) continue;

        const fromUsername = msg.from?.username || "";
        if (fromUsername === myUsername) continue;
        if (!msg.message && !msg.text) continue;

        const messageText = msg.message || msg.text || "(media)";
        const createdTime = msg.created_time || "";

        // Send Telegram notification
        const tgMsg =
          `📩 <b>New IG DM from @${otherUsername}</b> (${customerName})\n\n` +
          `${messageText}\n\n` +
          `🕐 ${createdTime ? new Date(createdTime).toLocaleString("en-US", { timeZone: "America/Los_Angeles" }) : "just now"}`;

        await sendTelegram(tgMsg);

        // Store so we don't re-notify
        await supabase.from("communications").insert({
          type: "instagram",
          direction: "inbound",
          from_address: otherUsername,
          body: messageText,
          provider: "upload-post-dm-notify",
          external_id: msgId,
          status: "received",
          metadata: {
            ig_username: otherUsername,
            created_time: createdTime,
            source: "ig-dm-notify",
          },
        });

        notified++;
        notifiedIds.add(msgId);
      }
    }

    return new Response(
      JSON.stringify({ success: true, notified, skipped_unknown: skippedUnknown, total_conversations: conversations.length }),
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

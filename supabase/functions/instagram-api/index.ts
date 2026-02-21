import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GRAPH_API = "https://graph.facebook.com/v21.0";

interface IGConversation {
  id: string;
  participants: { id: string; username: string }[];
  messages: IGMessage[];
  updatedTime: string;
}

interface IGMessage {
  id: string;
  from: { id: string; username: string };
  to: { id: string; username: string }[];
  message: string;
  created_time: string;
}

interface SimplifiedConversation {
  id: string;
  participantUsername: string;
  participantId: string;
  lastMessage: string;
  lastMessageTime: string;
  messages: SimplifiedMessage[];
}

interface SimplifiedMessage {
  id: string;
  fromUsername: string;
  fromId: string;
  text: string;
  createdTime: string;
  isFromMe: boolean;
}

async function getConversations(token: string, igAccountId: string): Promise<SimplifiedConversation[]> {
  const url = `${GRAPH_API}/${igAccountId}/conversations?fields=participants,messages{message,from,to,created_time},updated_time&access_token=${token}&limit=25`;
  const res = await fetch(url);
  const data = await res.json();

  if (!res.ok) {
    console.error("IG conversations error:", JSON.stringify(data));
    throw new Error(data.error?.message || `Graph API error: ${res.status}`);
  }

  const conversations = data.data || [];

  return conversations.map((conv: any) => {
    const participants = conv.participants?.data || [];
    const other = participants.find((p: any) => p.id !== igAccountId) || participants[0] || { id: "", username: "unknown" };
    const msgs = conv.messages?.data || [];

    const simplifiedMessages: SimplifiedMessage[] = msgs.map((m: any) => ({
      id: m.id,
      fromUsername: m.from?.username || m.from?.id || "unknown",
      fromId: m.from?.id || "",
      text: m.message || "",
      createdTime: m.created_time || "",
      isFromMe: m.from?.id === igAccountId,
    }));

    return {
      id: conv.id,
      participantUsername: other.username || other.id,
      participantId: other.id,
      lastMessage: simplifiedMessages[0]?.text || "",
      lastMessageTime: conv.updated_time || simplifiedMessages[0]?.createdTime || "",
      messages: simplifiedMessages,
    };
  });
}

async function getConversationMessages(token: string, conversationId: string, igAccountId: string): Promise<SimplifiedMessage[]> {
  const url = `${GRAPH_API}/${conversationId}?fields=messages{message,from,to,created_time}&access_token=${token}`;
  const res = await fetch(url);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error?.message || `Graph API error: ${res.status}`);
  }

  const msgs = data.messages?.data || [];
  return msgs.map((m: any) => ({
    id: m.id,
    fromUsername: m.from?.username || m.from?.id || "unknown",
    fromId: m.from?.id || "",
    text: m.message || "",
    createdTime: m.created_time || "",
    isFromMe: m.from?.id === igAccountId,
  }));
}

async function sendMessage(token: string, igAccountId: string, recipientId: string, message: string): Promise<any> {
  const url = `${GRAPH_API}/${igAccountId}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text: message },
      access_token: token,
    }),
  });
  const data = await res.json();

  if (!res.ok) {
    console.error("IG send error:", JSON.stringify(data));
    throw new Error(data.error?.message || `Send failed: ${res.status}`);
  }

  return data;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const token = Deno.env.get("INSTAGRAM_ACCESS_TOKEN");
    const igAccountId = Deno.env.get("INSTAGRAM_ACCOUNT_ID");

    if (!token) throw new Error("INSTAGRAM_ACCESS_TOKEN not configured");
    if (!igAccountId) throw new Error("INSTAGRAM_ACCOUNT_ID not configured");

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    if (action === "conversations") {
      const conversations = await getConversations(token, igAccountId);
      return new Response(JSON.stringify({ conversations }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "messages") {
      const convId = url.searchParams.get("conversation_id");
      if (!convId) throw new Error("conversation_id required");
      const messages = await getConversationMessages(token, convId, igAccountId);
      return new Response(JSON.stringify({ messages }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "send") {
      const { recipient_id, message } = await req.json();
      if (!recipient_id || !message) throw new Error("recipient_id and message required");
      const result = await sendMessage(token, igAccountId, recipient_id, message);
      return new Response(JSON.stringify({ success: true, ...result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ error: "Unknown action. Use ?action=conversations|messages|send" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Instagram API error:", e);
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

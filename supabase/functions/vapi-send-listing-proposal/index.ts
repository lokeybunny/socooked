// Vapi AI Tool: send the $399 Real Estate Listing Video proposal.
//
// Designed to be called by a Vapi Assistant "function/tool" call.
// Vapi posts the tool invocation to this endpoint. We create a proposal
// row preloaded with the $399 listing package preset, then invoke the
// existing clawd-bot proposal-send flow so the client gets the same email
// + signing link as the manual UI sends.
//
// Accepted shapes (we tolerate all of these — Vapi changes the envelope):
//   1) { client_name, client_email, client_phone?, address?, bedrooms?, notes? }
//   2) { message: { toolCalls: [{ id, function: { arguments: {...} } }] } }
//   3) { toolCallList: [{ id, function: { arguments: {...} | "json string" } }] }
//   4) { arguments: {...} }
//
// Response is shaped for Vapi tool calls:
//   { results: [{ toolCallId, result: "..." }] }
//
// CORS open + no auth required (Vapi cannot send Supabase JWT).
// Set verify_jwt = false in supabase/config.toml.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-vapi-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

type Args = {
  client_name?: string;
  client_email?: string;
  client_phone?: string;
  address?: string;
  bedrooms?: number | string;
  notes?: string;
};

function parseArgs(payload: any): { args: Args; toolCallId: string | null } {
  let toolCallId: string | null = null;
  let raw: any = payload;

  // Vapi shape #1: message.toolCalls[]
  const tc1 = payload?.message?.toolCalls?.[0];
  if (tc1) {
    toolCallId = tc1.id ?? null;
    raw = tc1.function?.arguments ?? raw;
  }

  // Vapi shape #2: toolCallList[]
  const tc2 = payload?.toolCallList?.[0];
  if (!tc1 && tc2) {
    toolCallId = tc2.id ?? null;
    raw = tc2.function?.arguments ?? tc2.arguments ?? raw;
  }

  // Vapi shape #3: top-level arguments
  if (!tc1 && !tc2 && payload?.arguments) {
    raw = payload.arguments;
  }

  if (typeof raw === "string") {
    try { raw = JSON.parse(raw); } catch { /* leave as string */ }
  }

  const args: Args = (raw && typeof raw === "object") ? raw : {};
  return { args, toolCallId };
}

function vapiResponse(toolCallId: string | null, message: string, extra: Record<string, any> = {}) {
  // Vapi expects results[].result to be a string the assistant can speak.
  const body = {
    results: [
      {
        toolCallId: toolCallId ?? "vapi-listing-proposal",
        result: message,
      },
    ],
    ...extra,
  };
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function buildListingPreset(a: Args) {
  const bedroomsNum = Math.max(0, Number(a.bedrooms || 0) || 0);
  const extraBeds = Math.max(0, bedroomsNum - 4);
  const total = 399 + extraBeds * 50;
  const exp = new Date();
  exp.setDate(exp.getDate() + 14);

  const title = `Real Estate Listing Video — $${total} Package${a.address ? ` (${a.address})` : ""}`;

  const lineItems: any[] = [
    { description: "Real Estate Listing Video — $399 Package (up to 4 bedrooms)", quantity: 1, unit_price: 399 },
  ];
  if (extraBeds > 0) {
    lineItems.push({
      description: `Additional bedrooms over 4 (${extraBeds} × $50)`,
      quantity: extraBeds,
      unit_price: 50,
    });
  }

  const proposalBody = `Real Estate Listing Video — $${total} Package

Property: ${a.address || "N/A"}
Bedrooms: ${bedroomsNum || "N/A"}

What's included:
• 1 cinematic AI-enhanced listing video
• Full edit: color grading, transitions, music sync, AI furniture removal & visual enhancements
• Delivered in 9:16 vertical format, optimized for Instagram Reels & TikTok
• Up to 1 minute maximum runtime
• Covers up to 4 bedrooms
• 48–72 hour turnaround from asset delivery
• 2 free revisions

Bedroom add-ons:
• Properties with more than 4 bedrooms: +$50 per additional bedroom
  (Example: a 6-bedroom listing = $399 + (2 × $50) = $499)

Payment Terms:
• FULL PAYMENT IS REQUIRED BEFORE WORK IS RENDERED.
• All payments must be made via Zelle or Cash App OR Debit/Credit.
• Once this proposal is signed, the client may alternatively pay by debit or credit card through the /payme page.
• Final video delivered as MP4 (1080×1920) after payment is confirmed.
• Additional revisions beyond the 2 included: $50 each.

${a.notes ? `Additional notes:\n${a.notes}\n\n` : ""}By signing below, the client agrees to the scope, pricing, and payment terms outlined above.`;

  return {
    title,
    amount: total,
    currency: "USD",
    line_items: lineItems,
    notes:
      "Single AI-cinematic listing video for a real estate property. Full edit included, delivered in 9:16 Instagram/Reels format, up to 1 minute max length, covers up to 4 bedrooms. Additional bedrooms billed at $50/bedroom over 4. 48–72 hour turnaround.",
    terms:
      "FULL PAYMENT IS REQUIRED BEFORE WORK IS RENDERED. Payment must be made via Zelle or Cash App OR Debit/Credit. Once this proposal is signed, the client may also pay via debit or credit card through the /payme page. Two (2) free revisions included. Additional revisions billed at $50 each. Final video delivered as MP4 in 9:16 (1080×1920) format. Additional bedrooms over 4 billed at $50/bedroom.",
    proposal_body: proposalBody,
    expiration_date: exp.toISOString().slice(0, 10),
    signature_required: true,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let toolCallId: string | null = null;
  try {
    const payload = await req.json().catch(() => ({}));
    const parsed = parseArgs(payload);
    toolCallId = parsed.toolCallId;
    const a = parsed.args;

    // Optional shared-secret check (set VAPI_TOOL_SECRET in Lovable Cloud secrets;
    // configure same value as a custom header on the Vapi tool)
    const expectedSecret = Deno.env.get("VAPI_TOOL_SECRET");
    if (expectedSecret) {
      const got = req.headers.get("x-vapi-secret") || req.headers.get("authorization") || "";
      if (!got.includes(expectedSecret)) {
        return vapiResponse(toolCallId, "Unauthorized: missing or invalid Vapi tool secret.");
      }
    }

    if (!a.client_email || !a.client_name) {
      return vapiResponse(
        toolCallId,
        "I need both the client's full name and email address before I can send the listing proposal.",
      );
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const preset = buildListingPreset(a);

    // Try to attach to an existing customer (match by email)
    let customerId: string | null = null;
    const { data: existing } = await supabase
      .from("customers").select("id").eq("email", a.client_email).limit(1).maybeSingle();
    if (existing) customerId = existing.id;
    else {
      const { data: created } = await supabase.from("customers").insert({
        full_name: a.client_name,
        email: a.client_email,
        phone: a.client_phone || null,
        source: "vapi-listing-proposal",
        status: "lead",
      }).select("id").single();
      customerId = created?.id ?? null;
    }

    // Insert the proposal as draft
    const { data: proposal, error: insErr } = await supabase
      .from("proposals")
      .insert({
        ...preset,
        client_name: a.client_name,
        client_email: a.client_email,
        client_phone: a.client_phone || null,
        customer_id: customerId,
        status: "draft",
      })
      .select("*")
      .single();

    if (insErr || !proposal) {
      console.error("[vapi-send-listing-proposal] insert error:", insErr);
      return vapiResponse(
        toolCallId,
        `I couldn't save the proposal: ${insErr?.message || "unknown error"}.`,
      );
    }

    // Hand off to existing clawd-bot proposal-send flow (creates signing doc + emails)
    const sendUrl = `${SUPABASE_URL}/functions/v1/clawd-bot/proposal-send`;
    const BOT_SECRET = Deno.env.get("BOT_SECRET") || "";
    const sendRes = await fetch(sendUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ANON_KEY}`,
        "x-bot-secret": BOT_SECRET,
        apikey: ANON_KEY,
      },
      body: JSON.stringify({ id: proposal.id }),
    });
    const sendJson = await sendRes.json().catch(() => ({}));

    if (!sendRes.ok || !sendJson?.success) {
      console.error("[vapi-send-listing-proposal] send failed:", sendRes.status, sendJson);
      return vapiResponse(
        toolCallId,
        `The proposal was saved but email delivery failed: ${sendJson?.error || `HTTP ${sendRes.status}`}.`,
        { proposal_id: proposal.id },
      );
    }

    const signUrl = sendJson?.data?.sign_url || null;
    const niceMessage =
      `Done — I just emailed the $${preset.amount} listing video proposal to ${a.client_email}. ` +
      `They'll get a branded email with a one-click signing link${signUrl ? ` (${signUrl})` : ""}.`;

    return vapiResponse(toolCallId, niceMessage, {
      proposal_id: proposal.id,
      sign_url: signUrl,
      amount: preset.amount,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[vapi-send-listing-proposal] fatal:", msg);
    return vapiResponse(toolCallId, `Something went wrong sending the proposal: ${msg}.`);
  }
});

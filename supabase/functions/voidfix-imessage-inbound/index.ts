// VoidFix iMessage webhook receiver.
// VoidFix posts message.inbound / message.outbound events here.
// We log inbound messages into `communications` so the SMS thread shows replies.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(SUPABASE_URL, SERVICE_KEY);

function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

function normalizeE164(raw: string | null | undefined): string {
  const d = String(raw || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return `+${d}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  let payload: any = {};
  try { payload = await req.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }

  // VoidFix envelope: { event, data: { ... } }  — be permissive about shape.
  const event: string = String(payload?.event || payload?.type || "").toLowerCase();
  const d = payload?.data || payload?.message || payload;

  // Only care about inbound (replies). Outbound is already logged when we send.
  const direction: "inbound" | "outbound" =
    String(d?.direction || (event.includes("inbound") ? "inbound" : event.includes("outbound") ? "outbound" : "")).toLowerCase() === "outbound"
      ? "outbound" : "inbound";

  if (direction !== "inbound") {
    return json({ ok: true, skipped: "not_inbound", event });
  }

  const message = String(d?.content ?? d?.message ?? d?.body ?? "").trim();
  // Inbound: sender = recipient field on conversation (the person who messaged us).
  // VoidFix conversation list shows `recipient` = the other party for both directions.
  const fromRaw = d?.from ?? d?.sender ?? d?.recipient ?? d?.phoneNumber ?? d?.phone;
  const toRaw = d?.to ?? d?.lineNumber ?? d?.iMessageNumber ?? null;
  const from_address = normalizeE164(fromRaw);
  const to_address = normalizeE164(toRaw);
  const externalId = d?.id || d?.messageId || payload?.id || null;

  if (!from_address || !message) {
    console.warn("[voidfix-imessage-inbound] missing from/message", { from_address, hasMessage: !!message, payload });
    return json({ ok: false, error: "missing_from_or_message" }, 400);
  }

  // Idempotency: skip if we already logged this external_id.
  if (externalId) {
    const { data: existing } = await sb
      .from("communications")
      .select("id").eq("external_id", externalId).limit(1).maybeSingle();
    if (existing?.id) return json({ ok: true, deduped: true, id: existing.id });
  }

  const { data: ins, error } = await sb.from("communications").insert({
    type: "sms",
    direction: "inbound",
    body: message,
    from_address,
    to_address,
    phone_number: from_address,
    status: "received",
    provider: "voidfix-imessage",
    external_id: externalId,
    metadata: { voidfix_imessage: true, event, raw: d },
  }).select("id").single();

  if (error) {
    console.error("[voidfix-imessage-inbound] insert failed", error);
    return json({ ok: false, error: error.message }, 500);
  }

  return json({ ok: true, id: ins?.id });
});

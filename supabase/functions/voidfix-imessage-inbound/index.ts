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

  let message = String(d?.content ?? d?.message ?? d?.body ?? "").trim();

  // Extract media attachments. VoidFix may send under various field names.
  const collectUrls = (val: any): string[] => {
    if (!val) return [];
    if (typeof val === "string") return [val];
    if (Array.isArray(val)) {
      return val.flatMap((v) => {
        if (typeof v === "string") return [v];
        if (v && typeof v === "object") return [v.url, v.uri, v.href, v.publicUrl, v.downloadUrl].filter(Boolean);
        return [];
      });
    }
    if (typeof val === "object") return [val.url, val.uri, val.href, val.publicUrl, val.downloadUrl].filter(Boolean);
    return [];
  };
  const mediaCandidates = [
    d?.attachments, d?.attachment, d?.media, d?.mediaUrls, d?.media_urls,
    d?.mediaUrl, d?.media_url, d?.images, d?.files, d?.assets,
  ];
  const media_urls = Array.from(new Set(
    mediaCandidates.flatMap(collectUrls).filter((u: any) => typeof u === "string" && /^https?:\/\//i.test(u))
  ));

  // If body is an empty/placeholder like "[Image]" or "[Attachment]" but media exists, drop it.
  if (media_urls.length && /^\s*\[(image|images|attachment|attachments|photo|video|media|gif|sticker|audio|voice|voice\s*memo|voice\s*message|voicemail|recording)\]\s*$/i.test(message)) {
    message = "";
  }

  // Inbound: sender = recipient field on conversation (the person who messaged us).
  const fromRaw = d?.from ?? d?.sender ?? d?.recipient ?? d?.phoneNumber ?? d?.phone;
  const toRaw = d?.to ?? d?.lineNumber ?? d?.iMessageNumber ?? null;
  const from_address = normalizeE164(fromRaw);
  const to_address = normalizeE164(toRaw);
  const externalId = d?.id || d?.messageId || payload?.id || null;

  if (!from_address || (!message && media_urls.length === 0)) {
    console.warn("[voidfix-imessage-inbound] missing from/message", { from_address, hasMessage: !!message, hasMedia: media_urls.length, payload });
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
    media_urls: media_urls.length ? media_urls : null,
    metadata: { voidfix_imessage: true, event, raw: d, has_media: media_urls.length > 0 },
  }).select("id").single();

  if (error) {
    console.error("[voidfix-imessage-inbound] insert failed", error);
    return json({ ok: false, error: error.message }, 500);
  }

  // KILL SWITCH (2026-05-14): "How much" pricing auto-reply permanently disabled (spam flag).
  let pricingPromise: Promise<unknown> | null = null;
  const HOW_MUCH_RE = /how\s*much/i;
  if (message && HOW_MUCH_RE.test(message)) {
    console.log(`[voidfix-imessage-inbound] auto-reply kill-switch active — skipping pricing reply to ${from_address}`);
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/auto_reply_kill_log`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          source: "voidfix-imessage-inbound",
          from_phone: from_address,
          reason: "iMessage how-much auto-reply blocked",
          metadata: { inbound_external_id: externalId, inbound_body: message },
        }),
      }).catch(() => {});
    } catch {}
  }

  // Fire-and-forget: auto-audit the sender's device so the SMS thread
  // auto-routes to iMessage vs SMS. The audit fn is idempotent — it locks
  // once device_type is set, so repeat inbounds won't re-spend on Twilio Lookup.
  const auditPromise = fetch(`${SUPABASE_URL}/functions/v1/phone-device-audit`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
    body: JSON.stringify({ action: "run", phone: from_address }),
  }).then(r => r.text()).catch(e => console.error("[voidfix-imessage-inbound] audit error", e));
  // @ts-ignore EdgeRuntime is provided in Supabase functions runtime
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
    // @ts-ignore
    EdgeRuntime.waitUntil(auditPromise);
    // @ts-ignore
    if (pricingPromise) EdgeRuntime.waitUntil(pricingPromise);
  }

  return json({ ok: true, id: ins?.id });
});

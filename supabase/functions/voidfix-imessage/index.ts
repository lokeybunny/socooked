// VoidFix iMessage edge function
// Actions:
//  - send: { action:'send', to, body, customer_id?, force_imessage? }
//  - validate: { action:'validate', to } -> { ok, isImessage }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const API_BASE = "https://imessage.voidfix.com/api/v1";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const API_KEY = Deno.env.get("VOIDFIX_IMESSAGE_API_KEY") || "";
const API_SECRET = Deno.env.get("VOIDFIX_IMESSAGE_API_SECRET") || "";

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

let cachedToken: { token: string; expiresAt: number } | null = null;

function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function normalizeE164(raw: string): string {
  const d = String(raw || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return `+${d}`;
}

async function getToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;
  if (!API_KEY || !API_SECRET) throw new Error("VoidFix iMessage credentials missing");
  const r = await fetch(`${API_BASE}/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey: API_KEY, apiSecret: API_SECRET }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j?.data?.token) throw new Error(j?.error || `auth_failed_${r.status}`);
  // 23h cache (token is 24h)
  cachedToken = { token: j.data.token, expiresAt: Date.now() + 23 * 60 * 60 * 1000 };
  return cachedToken.token;
}

async function imsgFetch(path: string, init: RequestInit = {}) {
  const token = await getToken();
  const r = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });
  const j = await r.json().catch(() => ({}));
  // Auto-retry once on 401 (stale token)
  if (r.status === 401) {
    cachedToken = null;
    const t2 = await getToken();
    const r2 = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${t2}`, ...(init.headers || {}) },
    });
    return { ok: r2.ok, status: r2.status, body: await r2.json().catch(() => ({})) };
  }
  return { ok: r.ok, status: r.status, body: j };
}

async function actionValidate(to: string) {
  const recipient = normalizeE164(to);
  if (!recipient) return json({ ok: false, error: "invalid_phone" }, 400);
  const res = await imsgFetch("/messages/validate-imessage", {
    method: "POST",
    body: JSON.stringify({ phone: recipient, recipient }),
  });
  const isImessage = !!(
    res.body?.data?.isImessage ??
    res.body?.data?.hasIMessage ??
    res.body?.data?.iMessage ??
    res.body?.isImessage ??
    res.body?.hasIMessage ??
    res.body?.data?.is_imessage
  );
  return json({ ok: res.ok, isImessage, raw: res.body });
}

async function actionSend(payload: any) {
  const recipient = normalizeE164(payload.to || payload.recipient);
  const message = String(payload.body || payload.message || "").trim();
  const attachments: string[] = Array.isArray(payload.attachments)
    ? payload.attachments.filter((u: any) => typeof u === "string" && u)
    : [];
  if (!recipient || (!message && attachments.length === 0)) {
    return json({ ok: false, error: "missing_recipient_or_message" }, 400);
  }

  // Manual cooldown — admin can pause iMessage API for 24h via /sms → Cool Down
  try {
    const { data: cd } = await sb
      .from("app_settings")
      .select("value")
      .eq("key", "voidfix_manual_cooldown")
      .maybeSingle();
    const until = (cd?.value as any)?.imessage_until;
    if (until && new Date(until).getTime() > Date.now()) {
      return json({ ok: false, error: "manual_cooldown", channel: "imessage", until }, 423);
    }
  } catch (e) { console.error("[voidfix-imessage] cooldown check failed:", (e as any)?.message || e); }

  // VoidFix's public /messages/send API does NOT support attachments — only `recipient` and `message`.
  // For attachments, we inline the URL(s) into the message body so the recipient sees a clickable link.
  const composedMessage = attachments.length
    ? [message, ...attachments].filter(Boolean).join("\n")
    : message;
  const sendBody: Record<string, unknown> = { recipient, message: composedMessage || " " };
  if (payload.iMessageLineId) sendBody.iMessageLineId = payload.iMessageLineId;

  // Send to VoidFix inline. In practice it responds in ~150ms even for media URLs.
  let res = await imsgFetch("/messages/send", { method: "POST", body: JSON.stringify(sendBody) });
  if (!res.ok && [502, 503, 504, 408].includes(res.status)) {
    await new Promise((r) => setTimeout(r, 1500));
    res = await imsgFetch("/messages/send", { method: "POST", body: JSON.stringify(sendBody) });
  }

  const data = res.body?.data || {};
  const channel: string = String(data.channel || data.deliveredVia || "imessage").toLowerCase();
  const provider = channel.includes("sms") ? "voidfix-imessage-sms" : "voidfix-imessage";

  // Log the outbound message with its final status.
  let pendingId: string | null = null;
  try {
    const ins = await sb.from("communications").insert({
      type: "sms",
      direction: "outbound",
      body: attachments.length ? `${message}${message ? "\n" : ""}${attachments.join("\n")}` : message,
      media_urls: attachments.length ? attachments : null,
      to_address: recipient,
      phone_number: recipient,
      from_address: data.from || data.lineNumber || null,
      external_id: data.id || data.messageId || null,
      status: res.ok ? "sent" : "failed",
      provider,
      customer_id: payload.customer_id || null,
      metadata: { voidfix_imessage: true, channel, raw: data, http_status: res.status },
    }).select("id").single();
    pendingId = ins.data?.id || null;
  } catch (e) {
    console.error("[voidfix-imessage] log insert failed", e);
  }

  if (!res.ok) {
    const friendly = [502, 503, 504, 408].includes(res.status)
      ? "VoidFix gateway timed out — message not sent. Try again in a moment."
      : (res.body?.error || `send_failed_${res.status}`);
    return json({ ok: false, error: friendly, status: res.status, raw: res.body }, 200);
  }
  return json({ ok: true, channel, provider, data, id: pendingId });
}

async function actionReact(payload: any) {
  const recipient = normalizeE164(payload.to || payload.recipient);
  const messageId = String(payload.messageId || payload.message_id || "");
  const reaction = String(payload.reaction || "heart");
  if (!recipient || !messageId) return json({ ok: false, error: "missing_recipient_or_message_id" }, 200);
  // VoidFix endpoint name varies by build; try several known shapes.
  const candidates = [
    { path: "/messages/react", body: { recipient, messageId, reaction } },
    { path: "/messages/tapback", body: { recipient, messageId, tapback: reaction } },
    { path: "/messages/reaction", body: { recipient, messageId, reaction } },
  ];
  let lastErr: any = null;
  for (const c of candidates) {
    const res = await imsgFetch(c.path, { method: "POST", body: JSON.stringify(c.body) });
    if (res.ok) return json({ ok: true, reaction, raw: res.body });
    lastErr = res.body;
    const msg = String(res.body?.error || "");
    // Only keep trying on "route not found"; bail on other errors
    if (!/route not found|not\s*found/i.test(msg) && res.status !== 404) break;
  }
  // Soft failure — return 200 so client toast is friendly, no overlay
  return json({ ok: false, error: "tapback_not_supported_by_voidfix", raw: lastErr }, 200);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  let payload: any = {};
  try { payload = await req.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }
  const action = payload?.action;
  try {
    if (action === "send") return await actionSend(payload);
    if (action === "validate") return await actionValidate(payload.to);
    if (action === "react") return await actionReact(payload);
    return json({ ok: false, error: "unknown_action" }, 400);
  } catch (e) {
    console.error("[voidfix-imessage] error", e);
    return json({ ok: false, error: (e as Error).message || "internal_error" }, 500);
  }
});

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
    body: JSON.stringify({ recipient }),
  });
  const isImessage = !!(res.body?.data?.isImessage ?? res.body?.data?.iMessage ?? res.body?.isImessage);
  return json({ ok: res.ok, isImessage, raw: res.body });
}

async function actionSend(payload: any) {
  const recipient = normalizeE164(payload.to || payload.recipient);
  const message = String(payload.body || payload.message || "").trim();
  if (!recipient || !message) return json({ ok: false, error: "missing_recipient_or_message" }, 400);

  const sendBody: Record<string, unknown> = { recipient, message };
  if (payload.iMessageLineId) sendBody.iMessageLineId = payload.iMessageLineId;

  const res = await imsgFetch("/messages/send", {
    method: "POST",
    body: JSON.stringify(sendBody),
  });

  if (!res.ok) {
    return json({ ok: false, error: res.body?.error || `send_failed_${res.status}`, raw: res.body }, 502);
  }

  const data = res.body?.data || {};
  // VoidFix may indicate the actual delivery channel; fall back to 'imessage'.
  const channel: string = String(data.channel || data.deliveredVia || "imessage").toLowerCase();
  const provider = channel.includes("sms") ? "voidfix-imessage-sms" : "voidfix-imessage";

  // Log to communications so the SMS thread shows it.
  try {
    await sb.from("communications").insert({
      type: "sms",
      direction: "outbound",
      body: message,
      from_address: data.from || data.lineNumber || null,
      to_address: recipient,
      phone_number: recipient,
      status: "sent",
      provider,
      external_id: data.id || data.messageId || null,
      customer_id: payload.customer_id || null,
      metadata: { channel, voidfix_imessage: true, raw: data },
    });
  } catch (e) {
    console.error("[voidfix-imessage] log insert failed", e);
  }

  return json({ ok: true, channel, provider, data });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  let payload: any = {};
  try { payload = await req.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }
  const action = payload?.action;
  try {
    if (action === "send") return await actionSend(payload);
    if (action === "validate") return await actionValidate(payload.to);
    return json({ ok: false, error: "unknown_action" }, 400);
  } catch (e) {
    console.error("[voidfix-imessage] error", e);
    return json({ ok: false, error: (e as Error).message || "internal_error" }, 500);
  }
});

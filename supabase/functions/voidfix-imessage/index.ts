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
  const attachments: string[] = Array.isArray(payload.attachments)
    ? payload.attachments.filter((u: any) => typeof u === "string" && u)
    : [];
  if (!recipient || (!message && attachments.length === 0)) {
    return json({ ok: false, error: "missing_recipient_or_message" }, 400);
  }

  // VoidFix requires a non-empty message even when sending attachments only
  const sendBody: Record<string, unknown> = { recipient, message: message || " " };
  if (payload.iMessageLineId) sendBody.iMessageLineId = payload.iMessageLineId;
  if (attachments.length) {
    sendBody.attachments = attachments;
    sendBody.mediaUrls = attachments;
    if (attachments.length === 1) sendBody.mediaUrl = attachments[0];
  }

  // Optimistically log the outbound message so the UI thread updates instantly.
  // We update this row when VoidFix responds (in background for attachment sends).
  let pendingId: string | null = null;
  try {
    const ins = await sb.from("communications").insert({
      type: "sms",
      direction: "outbound",
      body: attachments.length ? `${message}${message ? "\n" : ""}${attachments.join("\n")}` : message,
      media_urls: attachments.length ? attachments : null,
      to_address: recipient,
      phone_number: recipient,
      status: attachments.length ? "queued" : "sent",
      provider: "voidfix-imessage",
      customer_id: payload.customer_id || null,
      metadata: { voidfix_imessage: true, queued: !!attachments.length },
    }).select("id").single();
    pendingId = ins.data?.id || null;
  } catch (e) {
    console.error("[voidfix-imessage] pre-log insert failed", e);
  }

  // Background processor — handles slow VoidFix media uploads without timing out the request
  const processSend = async () => {
    let res = await imsgFetch("/messages/send", { method: "POST", body: JSON.stringify(sendBody) });
    if (!res.ok && [502, 503, 504, 408].includes(res.status)) {
      await new Promise((r) => setTimeout(r, 2000));
      res = await imsgFetch("/messages/send", { method: "POST", body: JSON.stringify(sendBody) });
    }
    const data = res.body?.data || {};
    const channel: string = String(data.channel || data.deliveredVia || "imessage").toLowerCase();
    const provider = channel.includes("sms") ? "voidfix-imessage-sms" : "voidfix-imessage";
    if (pendingId) {
      try {
        await sb.from("communications").update({
          status: res.ok ? "sent" : "failed",
          provider,
          from_address: data.from || data.lineNumber || null,
          external_id: data.id || data.messageId || null,
          error: res.ok ? null : (res.body?.error || `send_failed_${res.status}`),
          metadata: { channel, voidfix_imessage: true, raw: data, http_status: res.status },
        }).eq("id", pendingId);
      } catch (e) { console.error("[voidfix-imessage] update failed", e); }
    }
    return { ok: res.ok, status: res.status, body: res.body, channel, provider, data };
  };

  // For attachment sends, return immediately and finish in background.
  // VoidFix media uploads can take 60-120s and exceed the request timeout.
  if (attachments.length) {
    // @ts-ignore - EdgeRuntime is provided by Supabase edge runtime
    EdgeRuntime.waitUntil(processSend().catch((e) => console.error("[voidfix-imessage] bg send error", e)));
    return json({ ok: true, queued: true, id: pendingId, channel: "imessage", provider: "voidfix-imessage" }, 202);
  }

  // Text-only sends complete fast — wait inline so the client sees the result.
  const result = await processSend();
  if (!result.ok) {
    const friendly = [502, 503, 504, 408].includes(result.status)
      ? "VoidFix gateway timed out — message not sent. Try again in a moment."
      : (result.body?.error || `send_failed_${result.status}`);
    return json({ ok: false, error: friendly, status: result.status, raw: result.body }, 200);
  }
  return json({ ok: true, channel: result.channel, provider: result.provider, data: result.data, id: pendingId });
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

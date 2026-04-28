// Issues a Twilio Access Token (JWT) for the browser Voice SDK.
// Auto-provisions an API Key + a TwiML Application on first run and caches
// their SIDs in `app_settings` so the user never has to configure anything.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID")!;
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const SETTINGS_KEY = "twilio_voice_app";
const VOICE_TWIML_URL = `${SUPABASE_URL}/functions/v1/twilio-voice-twiml`;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function basicAuth() {
  return `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`;
}

async function twilioForm(path: string, body: Record<string, string>) {
  const resp = await fetch(`https://api.twilio.com${path}`, {
    method: "POST",
    headers: {
      Authorization: basicAuth(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body).toString(),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.message || `Twilio ${resp.status}`);
  return data;
}

interface VoiceAppCache {
  api_key_sid: string;
  api_key_secret: string;
  twiml_app_sid: string;
}

async function getOrProvisionVoiceApp(): Promise<VoiceAppCache> {
  const { data: existing } = await sb
    .from("app_settings")
    .select("value")
    .eq("key", SETTINGS_KEY)
    .maybeSingle();

  if (existing?.value?.api_key_sid && existing?.value?.api_key_secret && existing?.value?.twiml_app_sid) {
    return existing.value as VoiceAppCache;
  }

  // 1. Create TwiML Application pointed at our voice TwiML endpoint
  const app = await twilioForm(`/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Applications.json`, {
    FriendlyName: "Warren Guru Browser Dialer",
    VoiceUrl: VOICE_TWIML_URL,
    VoiceMethod: "POST",
  });

  // 2. Create an API Key (Secret only returned once at creation)
  const key = await twilioForm(`/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Keys.json`, {
    FriendlyName: "Warren Guru Browser Dialer",
  });

  const cache: VoiceAppCache = {
    api_key_sid: key.sid,
    api_key_secret: key.secret,
    twiml_app_sid: app.sid,
  };

  await sb.from("app_settings").upsert({ key: SETTINGS_KEY, value: cache }, { onConflict: "key" });
  return cache;
}

// ---- JWT (HS256) signing ----
function b64url(bytes: Uint8Array): string {
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlString(s: string): string {
  return b64url(new TextEncoder().encode(s));
}

async function signJwt(payload: Record<string, unknown>, secret: string, headerExtras: Record<string, unknown> = {}) {
  const header = { alg: "HS256", typ: "JWT", ...headerExtras };
  const headerB64 = b64urlString(JSON.stringify(header));
  const payloadB64 = b64urlString(JSON.stringify(payload));
  const data = `${headerB64}.${payloadB64}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)));
  return `${data}.${b64url(sig)}`;
}

async function buildAccessToken(identity: string, app: VoiceAppCache, ttlSeconds = 3600) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    jti: `${app.api_key_sid}-${now}`,
    iss: app.api_key_sid,
    sub: TWILIO_ACCOUNT_SID,
    iat: now,
    exp: now + ttlSeconds,
    grants: {
      identity,
      voice: {
        incoming: { allow: true },
        outgoing: { application_sid: app.twiml_app_sid },
      },
    },
  };
  return signJwt(payload, app.api_key_secret, { cty: "twilio-fpa;v=1" });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
      return json({ error: "Twilio credentials not configured" }, 500);
    }
    const body = await req.json().catch(() => ({}));
    const identity = (body.identity || "browser-user").toString().slice(0, 121);

    const app = await getOrProvisionVoiceApp();
    const token = await buildAccessToken(identity, app);
    return json({ ok: true, token, identity, ttl: 3600 });
  } catch (err) {
    console.error("[twilio-voice-token]", err);
    return json({ error: String(err?.message || err) }, 500);
  }
});

// Twilio recording proxy — streams a Twilio voicemail recording with basic auth
// so the browser <audio> tag can play it without exposing credentials.
//
// Usage: GET /twilio-recording-proxy?sid=REabc... (returns audio/mpeg)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, range",
  "Access-Control-Expose-Headers": "content-length, content-range, accept-ranges",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID") || "";
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN") || "";

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "GET") return new Response("Method not allowed", { status: 405, headers: CORS });

  try {
    // Require an authenticated user (uses caller's JWT from Authorization header)
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!jwt) return new Response("Unauthorized", { status: 401, headers: CORS });
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return new Response("Unauthorized", { status: 401, headers: CORS });

    const url = new URL(req.url);
    const sid = url.searchParams.get("sid") || "";
    if (!sid || !/^RE[a-f0-9]{32}$/i.test(sid)) {
      return new Response("Invalid recording sid", { status: 400, headers: CORS });
    }

    // Verify the SID exists in our missed_call_events table and get its stored URL
    const { data: ev } = await sb
      .from("missed_call_events")
      .select("id, voicemail_recording_url")
      .eq("voicemail_recording_sid", sid)
      .limit(1)
      .maybeSingle();
    if (!ev?.id) return new Response("Not found", { status: 404, headers: CORS });

    // Prefer the stored URL (it has the correct AccountSid that owns the recording).
    // Parse the owning AccountSid from the URL so basic-auth matches.
    const storedUrl = (ev.voicemail_recording_url || "").trim();
    const acctMatch = storedUrl.match(/\/Accounts\/(AC[a-f0-9]{32})\//i);
    const owningAccountSid = acctMatch?.[1] || TWILIO_ACCOUNT_SID;

    // Always request .mp3 explicitly, strip any existing extension
    const baseUrl = storedUrl
      ? storedUrl.replace(/\.(mp3|wav)(\?.*)?$/i, "")
      : `https://api.twilio.com/2010-04-01/Accounts/${owningAccountSid}/Recordings/${sid}`;
    const twilioUrl = `${baseUrl}.mp3`;
    // Basic auth must use the credentials that own TWILIO_AUTH_TOKEN (the main account).
    // The main account can access subaccount recording URLs.
    const authSid = TWILIO_ACCOUNT_SID || owningAccountSid;
    const basic = btoa(`${authSid}:${TWILIO_AUTH_TOKEN}`);
    const range = req.headers.get("range") || undefined;

    const fetchTwilio = () => fetch(twilioUrl, {
      headers: {
        Authorization: `Basic ${basic}`,
        ...(range ? { Range: range } : {}),
      },
    });

    let upstream = await fetchTwilio();
    // Twilio sometimes returns 500 if the recording is still being processed; retry once
    if (upstream.status === 500 || upstream.status === 404) {
      await new Promise((r) => setTimeout(r, 1500));
      upstream = await fetchTwilio();
    }

    if (!upstream.ok && upstream.status !== 206) {
      const text = await upstream.text().catch(() => "");
      return new Response(`Twilio error ${upstream.status} for ${twilioUrl}: ${text}`, { status: 502, headers: CORS });
    }

    const headers = new Headers(CORS);
    headers.set("Content-Type", upstream.headers.get("content-type") || "audio/mpeg");
    const cl = upstream.headers.get("content-length");
    if (cl) headers.set("Content-Length", cl);
    const cr = upstream.headers.get("content-range");
    if (cr) headers.set("Content-Range", cr);
    headers.set("Accept-Ranges", "bytes");
    headers.set("Cache-Control", "private, max-age=3600");

    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (err) {
    console.error("[twilio-recording-proxy]", err);
    return new Response((err as Error).message, { status: 500, headers: CORS });
  }
});

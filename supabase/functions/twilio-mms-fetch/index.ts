// twilio-mms-fetch
// Pulls MMS media attachments from Twilio (which require Basic Auth) and
// re-uploads them to the public `content-uploads` bucket so they can be
// rendered in the SMS UI without auth.
//
// Actions:
//  - { action: "fetch_one", sid: "<MessageSid>" }
//      Fetches /Messages/{sid}/Media.json, downloads each media item,
//      uploads to storage, and updates the matching communications row
//      (external_id = sid) by setting media_urls + appending to body.
//
//  - { action: "backfill", hours?: 168, to?: "+17028298105" }
//      Lists recent inbound Twilio messages with NumMedia > 0 and calls
//      fetch_one for each that doesn't already have media_urls saved.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TWILIO_SID = Deno.env.get("TWILIO_ACCOUNT_SID")!;
const TWILIO_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN") || Deno.env.get("TWILIO_PRIMARY_AUTH_TOKEN") || "";
const BUCKET = "content-uploads";
const DEFAULT_LANDLINE = "+17028298105";

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

function extFromContentType(ct: string): string {
  const t = ct.toLowerCase();
  if (t.includes("jpeg")) return "jpg";
  if (t.includes("png")) return "png";
  if (t.includes("gif")) return "gif";
  if (t.includes("webp")) return "webp";
  if (t.includes("heic")) return "heic";
  if (t.includes("bmp")) return "bmp";
  if (t.includes("video/mp4")) return "mp4";
  if (t.includes("video/quicktime")) return "mov";
  if (t.includes("3gpp")) return "3gp";
  if (t.includes("pdf")) return "pdf";
  return "bin";
}

function authHeader() {
  return `Basic ${btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`)}`;
}

async function fetchMediaForSid(sid: string): Promise<{ urls: string[]; uploaded: number; errors: string[] }> {
  const errors: string[] = [];
  const urls: string[] = [];

  // List media items for this message
  const listUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages/${sid}/Media.json`;
  const listResp = await fetch(listUrl, { headers: { Authorization: authHeader() } });
  if (!listResp.ok) {
    const text = await listResp.text();
    throw new Error(`Twilio media list ${listResp.status}: ${text.slice(0, 300)}`);
  }
  const list = await listResp.json();
  const items = (list.media_list || []) as Array<{ sid: string; content_type: string; uri: string }>;

  let i = 0;
  for (const item of items) {
    try {
      // Twilio media binary endpoint = same as item.uri but with .json swapped to nothing,
      // OR use https://api.twilio.com/2010-04-01/Accounts/{Sid}/Messages/{MsgSid}/Media/{MediaSid}
      // which 302-redirects to a signed S3 URL.
      const binUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages/${sid}/Media/${item.sid}`;
      const mediaResp = await fetch(binUrl, {
        headers: { Authorization: authHeader() },
        redirect: "follow",
      });
      if (!mediaResp.ok) {
        errors.push(`media ${item.sid}: HTTP ${mediaResp.status}`);
        continue;
      }
      const ct = mediaResp.headers.get("content-type") || item.content_type || "application/octet-stream";
      const buf = new Uint8Array(await mediaResp.arrayBuffer());
      const ext = extFromContentType(ct);
      const path = `sms-media/${sid}/${i}-${item.sid}.${ext}`;

      const { error: upErr } = await sb.storage.from(BUCKET).upload(path, buf, {
        contentType: ct,
        upsert: true,
      });
      if (upErr) {
        errors.push(`upload ${item.sid}: ${upErr.message}`);
        continue;
      }
      const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);
      if (pub?.publicUrl) urls.push(pub.publicUrl);
      i++;
    } catch (e) {
      errors.push(`media ${item.sid}: ${(e as Error).message}`);
    }
  }

  return { urls, uploaded: urls.length, errors };
}

async function applyToCommunication(sid: string, urls: string[]) {
  if (urls.length === 0) return { updated: 0 };
  const { data: row } = await sb
    .from("communications")
    .select("id, body, media_urls")
    .eq("external_id", sid)
    .limit(1)
    .maybeSingle();
  if (!row) return { updated: 0, note: "no_communication_row_for_sid" };

  const existing = Array.isArray((row as any).media_urls) ? (row as any).media_urls as string[] : [];
  const merged = Array.from(new Set([...existing, ...urls]));

  // Append URLs to body so any text-only renderer still surfaces them.
  const bodyText = String((row as any).body || "").trim();
  const urlsBlock = urls.join(" ");
  const newBody = bodyText
    ? (urls.every((u) => bodyText.includes(u)) ? bodyText : `${bodyText}\n${urlsBlock}`)
    : urlsBlock;

  const { error } = await sb
    .from("communications")
    .update({ media_urls: merged, body: newBody })
    .eq("id", (row as any).id);
  if (error) return { updated: 0, error: error.message };
  return { updated: 1 };
}

async function fetchOne(sid: string) {
  if (!sid) return json({ ok: false, error: "missing_sid" }, 400);
  if (!TWILIO_SID || !TWILIO_TOKEN) return json({ ok: false, error: "twilio_creds_missing" }, 500);
  const result = await fetchMediaForSid(sid);
  const apply = await applyToCommunication(sid, result.urls);
  return json({ ok: true, sid, ...result, ...apply });
}

async function backfill(hours: number, to: string) {
  if (!TWILIO_SID || !TWILIO_TOKEN) return json({ ok: false, error: "twilio_creds_missing" }, 500);
  const since = new Date(Date.now() - hours * 3600 * 1000);
  const url = new URL(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`);
  url.searchParams.set("To", to);
  url.searchParams.set("PageSize", "200");
  url.searchParams.set("DateSent>", since.toISOString().slice(0, 10));

  const resp = await fetch(url.toString(), { headers: { Authorization: authHeader() } });
  if (!resp.ok) {
    const text = await resp.text();
    return json({ ok: false, error: `twilio_list_${resp.status}`, detail: text.slice(0, 300) }, 500);
  }
  const data = await resp.json();
  const messages = (data.messages || []) as Array<{ sid: string; num_media: string; direction: string; date_sent: string | null }>;

  const targets = messages.filter((m) => Number(m.num_media || "0") > 0 && m.direction?.startsWith("inbound"));
  const results: any[] = [];
  for (const m of targets) {
    // Skip if already has media on the row
    const { data: row } = await sb
      .from("communications")
      .select("id, media_urls")
      .eq("external_id", m.sid)
      .maybeSingle();
    if (row && Array.isArray((row as any).media_urls) && (row as any).media_urls.length > 0) {
      results.push({ sid: m.sid, skipped: "already_has_media" });
      continue;
    }
    try {
      const r = await fetchMediaForSid(m.sid);
      const apply = await applyToCommunication(m.sid, r.urls);
      results.push({ sid: m.sid, ...r, ...apply });
    } catch (e) {
      results.push({ sid: m.sid, error: (e as Error).message });
    }
  }
  return json({ ok: true, scanned: messages.length, with_media: targets.length, results });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  let p: any = {};
  try { p = await req.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }

  const action = p?.action;
  if (action === "fetch_one") return fetchOne(String(p.sid || ""));
  if (action === "backfill") return backfill(Math.max(1, Math.min(720, Number(p.hours || 168))), String(p.to || DEFAULT_LANDLINE));
  return json({ ok: false, error: "unknown_action" }, 400);
});

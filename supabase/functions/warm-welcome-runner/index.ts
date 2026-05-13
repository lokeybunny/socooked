// Warm Welcome Runner — invoked by pg_cron every minute (or manually).
// Picks up a small batch of pending targets across all 'running' campaigns,
// audits the device, generates an AI-personalized message, and sends via
// VoidFix iMessage (iPhone) or Twilio SMS (Android / fallback).
//
// Daily caps (per campaign, per UTC day):
//   - 50 NEW iMessage contacts (a contact is "new" if no prior 'sent'+imessage
//     warm_welcome_targets row exists for that phone_last10).
//   - 50 SMS sends.
// When either cap is hit -> campaign goes to 'cooldown' for 24h.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") || "";
const sb = createClient(SUPABASE_URL, SERVICE_KEY);

const BATCH_SIZE = 5;        // targets processed per invocation
const IMESSAGE_NEW_CAP = 50;
const SMS_CAP = 50;
const COOLDOWN_HOURS = 24;
// Per-send cooldown to avoid spam filters / rate flags.
// Randomized between MIN and MAX seconds between consecutive sends in a batch.
const SEND_COOLDOWN_MIN_MS = 12_000; // 12s
const SEND_COOLDOWN_MAX_MS = 25_000; // 25s

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const randCooldownMs = () =>
  SEND_COOLDOWN_MIN_MS + Math.floor(Math.random() * (SEND_COOLDOWN_MAX_MS - SEND_COOLDOWN_MIN_MS));

function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

async function logEvt(campaign_id: string, target_id: string | null, level: string, message: string, meta?: any) {
  try {
    await sb.from("warm_welcome_logs").insert({ campaign_id, target_id, level, message, meta: meta || null });
  } catch (_) {}
}

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

// Business-hours gate: 8 AM – 6 PM Pacific Time.
// (We treat PT generically; America/Los_Angeles handles PST/PDT correctly.)
function isWithinPTBusinessHours(now = new Date()): boolean {
  const hourStr = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    hour12: false,
  }).format(now);
  const h = parseInt(hourStr, 10);
  // 8:00–17:59 PT inclusive (stops at 6 PM sharp)
  return h >= 8 && h < 18;
}

function isTestCampaign(campaign: any): boolean {
  return !!(campaign?.filter_snapshot?.test);
}

async function rolloverIfNewDay(campaign: any) {
  const today = todayUTC();
  if (campaign.counters_day !== today) {
    await sb.from("warm_welcome_campaigns").update({
      counters_day: today,
      imessage_new_sent_today: 0,
      sms_sent_today: 0,
    }).eq("id", campaign.id);
    campaign.counters_day = today;
    campaign.imessage_new_sent_today = 0;
    campaign.sms_sent_today = 0;
  }
}

// A contact is "new" (and thus counts toward the daily cap) ONLY if we have
// never had a prior SMS/iMessage conversation with them. Presence in
// sms_contacts means we've already established communication — those do NOT
// increment the daily counter, regardless of channel.
async function isNewContact(phone_last10: string): Promise<boolean> {
  const { count: crmCount } = await sb.from("sms_contacts")
    .select("id", { count: "exact", head: true })
    .eq("phone_last10", phone_last10);
  if ((crmCount || 0) > 0) return false;

  // Also exclude anyone we've previously sent a warm-welcome to.
  const { count: wwCount } = await sb.from("warm_welcome_targets")
    .select("id", { count: "exact", head: true })
    .eq("phone_last10", phone_last10)
    .eq("status", "sent");
  return (wwCount || 0) === 0;
}

async function auditDevice(phone_e164: string): Promise<string> {
  // Returns: 'iphone' | 'android' | 'unknown'  (unknown -> default SMS)
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/phone-device-audit`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({ action: 'run', phone: phone_e164 }),
    });
    const j = await r.json().catch(() => ({}));
    const dev = String(j?.device_type || j?.device || j?.data?.device_type || "").toLowerCase();
    if (dev.includes("iphone") || dev === "ios") return "iphone";
    if (dev.includes("android")) return "android";
    return "unknown";
  } catch (_) {
    return "unknown";
  }
}

function fmtReplyAt(ts?: string | null): string {
  if (!ts) return "recently";
  try {
    const d = new Date(ts);
    const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" });
    const date = d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" });
    return `${time} on ${date}`;
  } catch { return "recently"; }
}

async function aiGenerateMessage(target: any, channel: string): Promise<string> {
  const firstName = (target.name || "").split(/\s+/)[0] || "there";
  const replyAtStr = fmtReplyAt(target.reply_at);
  const replyText = (target.reply_text || "").trim();

  const fallback = `Hey ${firstName}, I texted you the other day and you replied "${replyText || 'about my offer'}" around ${replyAtStr}. ` +
    `My name is Warren Guru — I'm a video AI director, and I'd love to work with you on a property you potentially have listed, with no money down on my end. Did you get a chance to see my reel?`;

  if (!LOVABLE_API_KEY) return fallback;

  const sys = `You write short, friendly ${channel === 'imessage' ? 'iMessage' : 'SMS'} outreach messages from "Warren Guru" — a video AI director.
Voice: warm, casual, confident, conversational. 1 short paragraph. NO emojis. NO links. Under 320 chars for SMS, under 500 for iMessage.
You MUST: greet by first name, reference what they previously replied (quote it briefly), reference roughly when they replied (time + date if available), introduce yourself as "Warren Guru, video AI director", mention you'd like to work with them on a property they have listed with NO MONEY DOWN, and end with a soft question (e.g. "Did you see my reel?").
Do NOT use placeholder brackets. If a value is missing, write naturally without it.`;

  const user = `Recipient first name: ${firstName}
Recipient reply text: ${replyText || '(none)'}
Reply timestamp: ${replyAtStr}
Channel: ${channel}

Write the message now.`;

  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: sys }, { role: "user", content: user }],
      }),
    });
    if (!r.ok) return fallback;
    const j = await r.json();
    const txt = j?.choices?.[0]?.message?.content?.trim();
    return txt && txt.length > 20 ? txt : fallback;
  } catch { return fallback; }
}

async function sendImessage(to: string, body: string) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/voidfix-imessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
    body: JSON.stringify({ action: 'send', to, body, force_imessage: true }),
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok && j?.ok !== false, raw: j };
}

async function sendSms(to: string, body: string) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/powerdial-sms`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
    body: JSON.stringify({ action: 'send', to, body }),
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok && j?.ok !== false, raw: j };
}

async function processCampaign(campaign: any) {
  // Cooldown gate
  if (campaign.cooldown_until && new Date(campaign.cooldown_until) > new Date()) {
    return { processed: 0, reason: 'cooldown' };
  }
  if (campaign.cooldown_until && new Date(campaign.cooldown_until) <= new Date()) {
    await sb.from("warm_welcome_campaigns").update({ status: 'running', cooldown_until: null }).eq("id", campaign.id);
    await logEvt(campaign.id, null, 'info', 'Cooldown expired — resuming');
    campaign.cooldown_until = null;
    campaign.status = 'running';
  }

  const testMode = isTestCampaign(campaign);

  // Business-hours gate (skip for test campaigns)
  if (!testMode && !isWithinPTBusinessHours()) {
    await logEvt(campaign.id, null, 'info', 'Outside 8 AM–6 PM PT window — pausing until next eligible minute');
    return { processed: 0, reason: 'outside_business_hours' };
  }

  await rolloverIfNewDay(campaign);

  // GLOBAL per-API caps: 50 NEW contacts/day across ALL campaigns combined.
  // Sum today's counters from every campaign (running + cooldown), so caps are
  // enforced at the API/account level — not per-campaign.
  const today = todayUTC();
  const { data: globalRows } = await sb
    .from("warm_welcome_campaigns")
    .select("imessage_new_sent_today, sms_sent_today")
    .eq("counters_day", today);
  let globalImessageSent = (globalRows || []).reduce((s: number, r: any) => s + (r.imessage_new_sent_today || 0), 0);
  let globalAndroidSent  = (globalRows || []).reduce((s: number, r: any) => s + (r.sms_sent_today || 0), 0);

  const imessageApiRoom = IMESSAGE_NEW_CAP - globalImessageSent;
  const androidApiRoom  = SMS_CAP          - globalAndroidSent;
  if (!testMode && imessageApiRoom <= 0 && androidApiRoom <= 0) {
    const until = new Date(Date.now() + COOLDOWN_HOURS * 3600 * 1000).toISOString();
    await sb.from("warm_welcome_campaigns").update({ status: 'cooldown', cooldown_until: until }).eq("id", campaign.id);
    await logEvt(campaign.id, null, 'warn', `Both API daily caps reached. Cooling down ${COOLDOWN_HOURS}h until ${until}`);
    return { processed: 0, reason: 'caps_reached' };
  }

  const { data: targets } = await sb.from("warm_welcome_targets")
    .select("*")
    .eq("campaign_id", campaign.id)
    .in("status", ["pending", "audited"])
    .lte("next_attempt_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (!targets || targets.length === 0) {
    // Check if anything is left
    const { count } = await sb.from("warm_welcome_targets")
      .select("id", { count: 'exact', head: true })
      .eq("campaign_id", campaign.id)
      .in("status", ["pending", "audited", "auditing", "sending"]);
    if ((count || 0) === 0) {
      await sb.from("warm_welcome_campaigns").update({ status: 'done' }).eq("id", campaign.id);
      await logEvt(campaign.id, null, 'success', 'Campaign completed — all contacts processed');
    }
    return { processed: 0, reason: 'no_targets' };
  }

  let processed = 0;
  // Per-campaign deltas (so we can persist this campaign's row at the end).
  let campaignImessageSent = campaign.imessage_new_sent_today || 0;
  let campaignAndroidSent  = campaign.sms_sent_today          || 0;
  let totalSent = campaign.total_sent || 0;
  let totalFailed = campaign.total_failed || 0;
  let totalSkipped = campaign.total_skipped || 0;

  for (const t of targets) {
    // ATOMIC CLAIM: prevent concurrent runners from double-sending the same target.
    // Only one worker can transition pending|audited -> auditing.
    const { data: claimed } = await sb.from("warm_welcome_targets")
      .update({ status: 'auditing', updated_at: new Date().toISOString() })
      .eq("id", t.id)
      .in("status", ["pending", "audited"])
      .select("id")
      .maybeSingle();
    if (!claimed) {
      await logEvt(campaign.id, t.id, 'info', `Skipped ${t.phone_e164} — already claimed by another worker`);
      continue;
    }

    // 1. Audit (if not already done)
    let device = t.device_type;
    if (!device || t.status === 'pending') {
      device = await auditDevice(t.phone_e164);
      await logEvt(campaign.id, t.id, 'info', `Audit: ${t.phone_e164} -> ${device}`);
    }

    const channel  = device === 'iphone' ? 'imessage' : 'sms';
    const apiBucket: 'imessage_api' | 'android_api' =
      channel === 'imessage' ? 'imessage_api' : 'android_api';
    const isNew = await isNewContact(t.phone_last10);

    // GLOBAL cap check — counts NEW contacts across ALL campaigns.
    const bucketSent = apiBucket === 'imessage_api' ? globalImessageSent : globalAndroidSent;
    const bucketCap  = apiBucket === 'imessage_api' ? IMESSAGE_NEW_CAP   : SMS_CAP;
    if (!testMode && isNew && bucketSent >= bucketCap) {
      await sb.from("warm_welcome_targets").update({
        status: 'pending', device_type: device, channel,
        next_attempt_at: new Date(Date.now() + COOLDOWN_HOURS * 3600 * 1000).toISOString(),
      }).eq("id", t.id);
      const otherBucketSent = apiBucket === 'imessage_api' ? globalAndroidSent : globalImessageSent;
      const otherBucketCap  = apiBucket === 'imessage_api' ? SMS_CAP           : IMESSAGE_NEW_CAP;
      if (otherBucketSent >= otherBucketCap) {
        const until = new Date(Date.now() + COOLDOWN_HOURS * 3600 * 1000).toISOString();
        await sb.from("warm_welcome_campaigns").update({ status: 'cooldown', cooldown_until: until }).eq("id", campaign.id);
        await logEvt(campaign.id, t.id, 'warn', `GLOBAL caps reached on both APIs (${apiBucket}=${bucketSent}/${bucketCap}) — cooling down`);
        break;
      } else {
        await logEvt(campaign.id, t.id, 'info', `GLOBAL ${apiBucket} cap reached (${bucketSent}/${bucketCap}) — skipping; other API still open`);
        continue;
      }
    }

    // 2. Generate message
    const messageText = await aiGenerateMessage(t, channel);

    // 3. Send via the API bucket selected above
    await sb.from("warm_welcome_targets").update({
      status: 'sending', device_type: device, channel,
      message_text: messageText, is_new_imessage_contact: isNew,
      attempt_count: (t.attempt_count || 0) + 1,
    }).eq("id", t.id);

    const send = apiBucket === 'imessage_api'
      ? await sendImessage(t.phone_e164, messageText)
      : await sendSms(t.phone_e164, messageText);

    if (send.ok) {
      await sb.from("warm_welcome_targets").update({
        status: 'sent', sent_at: new Date().toISOString(), error: null,
      }).eq("id", t.id);
      // Increment GLOBAL counters and this campaign's local counters. Only NEW contacts count.
      if (isNew && apiBucket === 'imessage_api') { globalImessageSent += 1; campaignImessageSent += 1; }
      if (isNew && apiBucket === 'android_api')  { globalAndroidSent  += 1; campaignAndroidSent  += 1; }
      totalSent += 1;
      await logEvt(campaign.id, t.id, 'success',
        `Sent via ${apiBucket} (${channel}) to ${t.phone_e164}` +
        (isNew
          ? ` — NEW contact, GLOBAL ${apiBucket}=${apiBucket === 'imessage_api' ? globalImessageSent : globalAndroidSent}/${bucketCap}`
          : ' — existing CRM contact, no cap'));
    } else {
      await sb.from("warm_welcome_targets").update({
        status: 'failed', error: JSON.stringify(send.raw || {}).slice(0, 500),
      }).eq("id", t.id);
      totalFailed += 1;
      await logEvt(campaign.id, t.id, 'error', `Send failed via ${apiBucket} (${channel})`, send.raw);
    }
    processed += 1;

    const isLast = t === targets[targets.length - 1];
    if (!isLast && !testMode) {
      const waitMs = randCooldownMs();
      await logEvt(campaign.id, null, 'info', `Cooling down ${Math.round(waitMs/1000)}s before next send`);
      await sleep(waitMs);
    }
  }

  await sb.from("warm_welcome_campaigns").update({
    imessage_new_sent_today: campaignImessageSent,
    sms_sent_today: campaignAndroidSent,
    total_sent: totalSent,
    total_failed: totalFailed,
    total_skipped: totalSkipped,
    last_processed_at: new Date().toISOString(),
  }).eq("id", campaign.id);

  return { processed };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  let payload: any = {};
  try { payload = await req.json(); } catch { payload = {}; }

  // Optional: process a single campaign
  let q = sb.from("warm_welcome_campaigns").select("*").eq("status", "running");
  if (payload?.campaign_id) q = sb.from("warm_welcome_campaigns").select("*").eq("id", payload.campaign_id);
  const { data: campaigns } = await q;

  const results: any[] = [];
  for (const c of (campaigns || [])) {
    if (c.status !== 'running' && c.status !== 'cooldown') continue;
    try {
      const r = await processCampaign(c);
      results.push({ id: c.id, ...r });
    } catch (e: any) {
      await logEvt(c.id, null, 'error', `Runner exception: ${e?.message || e}`);
      results.push({ id: c.id, error: e?.message || String(e) });
    }
  }

  return json({ ok: true, results });
});

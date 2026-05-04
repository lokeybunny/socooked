// Campaign Leader: scheduler tick + test runner
// - GET / POST { mode: "tick" }     → runs one batch if within schedule + production enabled
// - POST { mode: "test", email, phone, first_name?, property_address?, channel: "email"|"sms"|"both" }
//   → runs a single test send without touching state_leads, suppression, or daily caps
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VOIDFIX_API_KEY = Deno.env.get("VOIDFIX_API_KEY") || "";
const VOIDFIX_DEVICE_ID = Deno.env.get("VOIDFIX_DEVICE_ID") || "";
const VOIDFIX_SEND_URL = "https://sms.voidfix.com/services/send.php";

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

// ---------- Email variation pool (anti-spam fingerprint rotation) ----------
// Large variant pools + per-message structural randomization keep spam filter
// fingerprints (subject hash, body hash, layout signature) unique on every send.

const SUBJECT_VARIANTS = [
  "Quick idea for your listing on {{addr}}",
  "Opportunity for your listing at {{addr}}",
  "Marketing idea for {{addr}}",
  "Question about your property at {{addr}}",
  "Thought about {{addr}}",
  "Quick note re: {{addr}}",
  "An idea for {{addr}}",
  "Concept for {{addr}}",
  "Suggestion regarding {{addr}}",
  "Following up about {{addr}}",
  "About your listing — {{addr}}",
  "Wanted to share something for {{addr}}",
  "A thought regarding {{addr}}",
  "Possible angle for {{addr}}",
  "Could be useful for {{addr}}",
  "Saw {{addr}} — quick question",
  "Brief note about {{addr}}",
  "Reaching out re: {{addr}}",
  "Idea I wanted to share for {{addr}}",
  "Quick proposal for {{addr}}",
  "Marketing angle for {{addr}}",
];

const GREETINGS = [
  "Hello",
  "Hi",
  "Hey",
  "Good day",
  "Greetings",
  "Hi there",
];

const EMAIL_INTROS = [
  "I came across your listing at {{addr}} and wanted to reach out with a quick idea.",
  "Saw your listing for {{addr}} and had a thought I wanted to share.",
  "Your listing at {{addr}} caught my eye — I wanted to send over a quick idea.",
  "Noticed your active listing at {{addr}} and figured this might be useful.",
  "I noticed {{addr}} on the market and wanted to share something that might help.",
  "Stumbled across {{addr}} earlier today and thought I'd reach out.",
  "Came across {{addr}} while browsing active listings and had an idea.",
  "Spotted your listing at {{addr}} and wanted to share a quick concept.",
  "Your property at {{addr}} popped up in my search — wanted to send a note.",
  "Was looking through new listings and {{addr}} stood out to me.",
  "Found your listing at {{addr}} and figured this idea might interest you.",
  "Just saw {{addr}} listed and thought I'd send over a quick note.",
];

const PITCH_INTROS = [
  "My name is Warren Guru.",
  "I'm Warren Guru.",
  "I go by Warren Guru.",
  "Quick intro — I'm Warren Guru.",
  "I'm Warren, also known as Warren Guru.",
];

const EMAIL_PITCHES = [
  "I specialize in AI-powered property marketing — drone-style visuals created without needing to physically walk the property.",
  "I create AI-driven cinematic property videos that don't require a physical walk-through.",
  "My work uses AI to produce drone-style marketing videos directly from existing photos — no on-site visit needed.",
  "I produce AI-generated marketing videos for listings using only the photos already on the MLS.",
  "I build AI-powered cinematic listing videos straight from the photos you already have — no site visit required.",
  "I focus on AI-driven property videos: cinematic, drone-style, and made entirely from existing imagery.",
  "What I do is craft AI-generated walkthrough videos using nothing more than the photos on the listing.",
  "I create high-end AI marketing reels for listings, built directly from the MLS photos already uploaded.",
  "My specialty is AI cinematic property videos — produced remotely from your current listing photos.",
];

const SAMPLE_LINES = [
  "You can see a sample of my work here:",
  "Here's a sample of recent work:",
  "Quick portfolio link:",
  "A few examples of past work:",
  "Take a look at a sample here:",
  "Recent work is on Instagram:",
  "Here's where you can preview the style:",
];

const EMAIL_CTAS = [
  "If you're open, I'd love to create a sample video for {{addr}}. I'm offering a 50% discount for first-time clients.",
  "Happy to put together a free preview for {{addr}} — first-time clients get 50% off.",
  "Would you be open to a quick demo for {{addr}}? First-timers get half off.",
  "Let me know if I can put together a quick preview — 50% off your first one.",
  "If interested, I can produce a short sample for {{addr}} — first-time clients receive 50% off.",
  "Let me know if you'd like a complimentary preview for {{addr}}; new clients get 50% off.",
  "Glad to spin up a quick sample for {{addr}} — 50% off applies for first-time clients.",
  "Open to a free demo for {{addr}}? First-time clients always get half off.",
  "I can put together a no-obligation preview for {{addr}} if you're interested — 50% off your first one.",
];

const SIGN_OFFS = [
  "Best regards",
  "Best",
  "Kind regards",
  "Warm regards",
  "Talk soon",
  "Thanks",
  "Appreciate your time",
  "All the best",
];

const SMS_OPENERS = [
  "Hi {{name}}, this is Warren Guru. Just emailed you about your listing at {{addr}}",
  "Hey {{name}}, Warren Guru here. Sent you a quick email about {{addr}}",
  "Hi {{name}}, this is Warren Guru — reached out via email about {{addr}}",
  "Hey {{name}}, Warren here. I just emailed you about your listing at {{addr}}",
  "Hi {{name}}, Warren Guru — just dropped you an email regarding {{addr}}",
  "Hey {{name}}, this is Warren. Sent over an email a moment ago about {{addr}}",
  "Hi {{name}}, Warren Guru reaching out — emailed you about {{addr}}",
  "Hey {{name}}, it's Warren Guru. Just sent an email about your listing at {{addr}}",
];

const SMS_BODIES = [
  "I would like to create an AI-powered property video for it without needing to walk the home.",
  "I would like to make an AI-driven listing video for it — no walk-through required.",
  "I would like to produce an AI marketing video for it straight from your existing photos.",
  "I'd love to put together an AI-generated cinematic video for it — no site visit needed.",
  "I can build an AI-powered listing reel for it directly from your current photos.",
  "I'd like to craft an AI-driven property video for it using only the existing MLS images.",
];

const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
const pickIdx = <T,>(arr: T[]) => Math.floor(Math.random() * arr.length);
const fill = (tpl: string, vars: Record<string, string>) =>
  tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");

// Inject an invisible zero-width character at random word boundaries to break
// content-hash fingerprinting without affecting human readability.
const ZW_CHARS = ["\u200B", "\u200C", "\u200D", "\u2060"];
function fingerprintText(text: string, count = 2): string {
  if (!text) return text;
  const words = text.split(" ");
  if (words.length < 4) return text;
  for (let i = 0; i < count; i++) {
    const pos = 1 + Math.floor(Math.random() * (words.length - 2));
    words[pos] = words[pos] + ZW_CHARS[Math.floor(Math.random() * ZW_CHARS.length)];
  }
  return words.join(" ");
}

function randomMargin(): number {
  // small variation in paragraph spacing — every email has a unique CSS hash
  return 12 + Math.floor(Math.random() * 6); // 12..17px
}

function randomHexId(len = 10): string {
  const c = "abcdef0123456789";
  let s = "";
  for (let i = 0; i < len; i++) s += c[Math.floor(Math.random() * c.length)];
  return s;
}

function buildEmail(firstName: string, addr: string) {
  const sIdx = pickIdx(SUBJECT_VARIANTS);
  const iIdx = pickIdx(EMAIL_INTROS);
  const pIdx = pickIdx(EMAIL_PITCHES);
  const cIdx = pickIdx(EMAIL_CTAS);
  const gIdx = pickIdx(GREETINGS);
  const piIdx = pickIdx(PITCH_INTROS);
  const slIdx = pickIdx(SAMPLE_LINES);
  const soIdx = pickIdx(SIGN_OFFS);

  const vars = { addr, name: firstName };
  const subject = fill(SUBJECT_VARIANTS[sIdx], vars);

  const greeting = GREETINGS[gIdx];
  const pitchIntro = PITCH_INTROS[piIdx];
  const intro = fill(EMAIL_INTROS[iIdx], vars);
  const pitch = EMAIL_PITCHES[pIdx];
  const sampleLine = SAMPLE_LINES[slIdx];
  const cta = fill(EMAIL_CTAS[cIdx], vars);
  const signOff = SIGN_OFFS[soIdx];

  // Per-message structural randomization
  const m1 = randomMargin();
  const m2 = randomMargin();
  const m3 = randomMargin();
  const m4 = randomMargin();
  const m5 = randomMargin();

  // Randomly merge or split intro + pitch paragraphs
  const mergeIntroPitch = Math.random() < 0.5;
  const introBlock = mergeIntroPitch
    ? `<p style="margin:0 0 ${m2}px 0;">${pitchIntro} ${fingerprintText(intro)} ${fingerprintText(pitch)}</p>`
    : `<p style="margin:0 0 ${m2}px 0;">${pitchIntro} ${fingerprintText(intro)}</p>\n<p style="margin:0 0 ${m3}px 0;">${fingerprintText(pitch)}</p>`;

  // Random invisible tracking id (unique per message) — kills content hash dedupe
  const trackId = randomHexId(12);

  const body = [
    `<p style="margin:0 0 ${m1}px 0;">${greeting} ${firstName},</p>`,
    introBlock,
    `<p style="margin:0 0 ${m4}px 0;">${sampleLine} <a href="https://instagram.com/W4RR3NGuru">instagram.com/W4RR3NGuru</a></p>`,
    `<p style="margin:0 0 ${m5}px 0;">${fingerprintText(cta)}</p>`,
    `<p style="margin:0 0 4px 0;">${signOff},</p>`,
    `<p style="margin:0 0 2px 0;">Warren Guru</p>`,
    `<p style="margin:0;"><a href="tel:+14802200405" style="color:#555;text-decoration:none;">(480) 220-0405</a></p>`,
    `<div style="display:none;color:transparent;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">ref:${trackId}</div>`,
  ].join("\n");

  const variant = sIdx * 1000 + iIdx * 100 + pIdx * 10 + cIdx;
  return { subject, body, variant };
}

function buildSms(firstName: string, addr: string) {
  const oIdx = pickIdx(SMS_OPENERS);
  const bIdx = pickIdx(SMS_BODIES);
  const vars = { name: firstName, addr };
  const opener = fill(SMS_OPENERS[oIdx], vars);
  const body = fill(SMS_BODIES[bIdx], vars);
  // randomize the connector punctuation and the sample link phrasing slightly
  const connectors = [". ", " — ", ". "];
  const connector = connectors[Math.floor(Math.random() * connectors.length)];
  const linkPhrases = [
    "See: https://instagram.com/W4RR3NGuru",
    "Sample: https://instagram.com/W4RR3NGuru",
    "Portfolio: https://instagram.com/W4RR3NGuru",
    "Examples: https://instagram.com/W4RR3NGuru",
  ];
  const linkPhrase = linkPhrases[Math.floor(Math.random() * linkPhrases.length)];
  const text = `${opener}${connector}${body} ${linkPhrase}`;
  return { text, variant: oIdx * 10 + bIdx };
}

// ---------- Gmail deliverability guards ----------
const GMAIL_HARD_DAILY_CAP = 1800;          // stay under Workspace 2k/day limit
const GMAIL_PER_DOMAIN_DAILY_CAP = 25;      // never blast a single recipient domain
const ROLE_PREFIX_BLOCK = [
  "no-reply", "noreply", "postmaster", "abuse", "admin", "support",
  "info", "sales", "billing", "contact", "help", "team", "office",
  "hello", "hr", "jobs", "careers", "marketing", "webmaster", "mailer-daemon",
];
const FREE_PROVIDER_THROTTLE = new Set(["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "aol.com", "icloud.com"]);

function emailLooksValid(e?: string | null): boolean {
  if (!e) return false;
  const s = e.trim().toLowerCase();
  // basic RFC-ish check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) return false;
  const local = s.split("@")[0];
  if (ROLE_PREFIX_BLOCK.some(p => local === p || local.startsWith(`${p}.`) || local.startsWith(`${p}-`))) return false;
  if (s.includes("..") || s.endsWith(".") || s.startsWith(".")) return false;
  return true;
}

function emailDomain(e: string): string {
  return (e.split("@")[1] || "").toLowerCase();
}

function isGmailRateLimitError(err: any): boolean {
  const s = String(err || "").toLowerCase();
  return s.includes("rate") || s.includes("quota") || s.includes("limit") || s.includes("429") || s.includes("user-rate") || s.includes("dailyquota");
}

// ---------- Senders ----------
async function sendEmail(to: string, subject: string, body: string) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/gmail-api?action=send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
    },
    body: JSON.stringify({ to, subject, body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data?.error || `gmail_${res.status}`, raw: data };
  return { ok: true, id: data?.id, raw: data };
}

async function sendSms(toE164: string, message: string) {
  if (!VOIDFIX_API_KEY || !VOIDFIX_DEVICE_ID) {
    return { ok: false, error: "missing_voidfix_credentials" };
  }
  const params = new URLSearchParams({
    key: VOIDFIX_API_KEY,
    number: toE164,
    message,
    devices: VOIDFIX_DEVICE_ID,
    type: "sms",
    prioritize: "0",
  });
  const res = await fetch(VOIDFIX_SEND_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { return { ok: false, error: "voidfix_invalid_json", raw: text.slice(0, 300) }; }
  if (!res.ok || data?.success === false) {
    return { ok: false, error: data?.message || data?.error || "voidfix_failed", raw: data };
  }
  return { ok: true, raw: data };
}

// ---------- Schedule guard ----------
function isBusinessHours(startHour: number, endHour: number): { ok: boolean; reason: string } {
  // PT = America/Los_Angeles
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short",
    hour: "numeric",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const weekday = parts.find(p => p.type === "weekday")?.value || "";
  const hour = parseInt(parts.find(p => p.type === "hour")?.value || "0", 10);
  if (["Sat", "Sun"].includes(weekday)) return { ok: false, reason: `weekend_${weekday}` };
  if (hour < startHour || hour >= endHour) return { ok: false, reason: `outside_hours_${hour}_pt` };
  return { ok: true, reason: `ok_${weekday}_${hour}` };
}

async function logActivity(contactId: string | null, level: string, step: string, message: string, isTest = false, meta: any = {}) {
  await sb.from("campaign_activity_log").insert({
    contact_id: contactId,
    level,
    step,
    message,
    meta,
    is_test: isTest,
  });
}

async function bumpDailyStat(field: "emails_sent" | "emails_failed" | "sms_sent" | "sms_failed") {
  const today = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }))
    .toISOString().slice(0, 10);
  // upsert
  const { data: existing } = await sb.from("campaign_daily_stats").select("*").eq("campaign_date", today).maybeSingle();
  if (!existing) {
    await sb.from("campaign_daily_stats").insert({ campaign_date: today, [field]: 1 });
  } else {
    await sb.from("campaign_daily_stats").update({ [field]: (existing[field] || 0) + 1, updated_at: new Date().toISOString() }).eq("campaign_date", today);
  }
}

// ---------- Per-channel back-to-back gap (5-25s randomized) ----------
// Email and SMS run on INDEPENDENT timers — SMS never blocks on email being delayed,
// and email never blocks on SMS being delayed. Each channel enforces its own min-gap
// between consecutive sends across the entire invocation.
const CHANNEL_MIN_GAP_MS = 5_000;
const CHANNEL_MAX_GAP_MS = 25_000;
const lastChannelSendAt: Record<"email" | "sms", number> = { email: 0, sms: 0 };

async function waitChannelGap(channel: "email" | "sms") {
  const last = lastChannelSendAt[channel];
  if (last === 0) return; // first send of this invocation
  const gap = CHANNEL_MIN_GAP_MS + Math.floor(Math.random() * (CHANNEL_MAX_GAP_MS - CHANNEL_MIN_GAP_MS));
  const remaining = last + gap - Date.now();
  if (remaining > 0) await new Promise(r => setTimeout(r, remaining));
}

async function alreadySent(channel: "email" | "sms", emailOrPhone: string): Promise<boolean> {
  if (!emailOrPhone) return false;
  const col = channel === "email" ? "email" : "phone_e164";
  const val = channel === "email" ? emailOrPhone.toLowerCase() : emailOrPhone;
  const { data } = await sb
    .from("campaign_sent_log")
    .select("id")
    .eq("channel", channel)
    .eq(col, val)
    .limit(1)
    .maybeSingle();
  return !!data;
}

// ---------- Independent email pipeline ----------
async function runEmailFor(contact: any): Promise<{ ok: boolean; skipped?: boolean }> {
  if (!contact.email) return { ok: false, skipped: true };
  if (await alreadySent("email", contact.email)) {
    await logActivity(contact.id, "info", "email_skipped_dup", `Email skipped (already sent): ${contact.email}`);
    await sb.from("campaign_contacts").update({ email_status: "skipped_duplicate" }).eq("id", contact.id);
    return { ok: false, skipped: true };
  }

  await waitChannelGap("email");
  await sb.from("campaign_contacts").update({ status: "emailing", last_step: "emailing" }).eq("id", contact.id);
  await logActivity(contact.id, "info", "emailing", `Sending email to ${contact.email}`);

  const firstName = contact.first_name || "there";
  const addr = contact.property_address || "your property";
  const { subject, body, variant: emailVariant } = buildEmail(firstName, addr);
  const emailResult = await sendEmail(contact.email, subject, body);
  lastChannelSendAt.email = Date.now();

  if (!emailResult.ok) {
    await sb.from("campaign_contacts").update({
      email_status: "failed",
      error_message: String(emailResult.error).slice(0, 500),
      last_step: "email_failed",
    }).eq("id", contact.id);
    await bumpDailyStat("emails_failed");
    await logActivity(contact.id, "error", "email_failed", String(emailResult.error));
    if (isGmailRateLimitError(emailResult.error) || isGmailRateLimitError(emailResult.raw)) {
      await sb.from("campaign_settings").update({ is_paused: true }).eq("id", 1);
      await logActivity(null, "error", "auto_pause", `Auto-paused: Gmail rate/quota signal — ${String(emailResult.error).slice(0, 200)}`);
    }
    return { ok: false };
  }

  await sb.from("campaign_contacts").update({
    status: "email_sent",
    email_status: "sent",
    email_sent_at: new Date().toISOString(),
    email_variant: emailVariant,
    last_step: "email_sent",
  }).eq("id", contact.id);
  await bumpDailyStat("emails_sent");
  await logActivity(contact.id, "success", "email_sent", `Email delivered to ${contact.email}`);

  try {
    await sb.from("campaign_sent_log").insert({
      email: contact.email,
      channel: "email",
      contact_id: contact.id,
      lead_id: contact.lead_id || null,
    });
  } catch (_) { /* dup ok */ }

  return { ok: true };
}

// ---------- Independent SMS pipeline ----------
async function runSmsFor(contact: any): Promise<{ ok: boolean; skipped?: boolean }> {
  if (!contact.phone_e164) return { ok: false, skipped: true };
  if (await alreadySent("sms", contact.phone_e164)) {
    await logActivity(contact.id, "info", "sms_skipped_dup", `SMS skipped (already sent): ${contact.phone_e164}`);
    await sb.from("campaign_contacts").update({ sms_status: "skipped_duplicate" }).eq("id", contact.id);
    return { ok: false, skipped: true };
  }

  await waitChannelGap("sms");
  await sb.from("campaign_contacts").update({ last_step: "texting" }).eq("id", contact.id);

  const firstName = contact.first_name || "there";
  const addr = contact.property_address || "your property";
  const { text, variant: smsVariant } = buildSms(firstName, addr);
  const smsResult = await sendSms(contact.phone_e164, text);
  lastChannelSendAt.sms = Date.now();

  if (!smsResult.ok) {
    await sb.from("campaign_contacts").update({
      sms_status: "failed",
      error_message: String(smsResult.error).slice(0, 500),
      last_step: "sms_failed",
    }).eq("id", contact.id);
    await bumpDailyStat("sms_failed");
    await logActivity(contact.id, "error", "sms_failed", String(smsResult.error));
    return { ok: false };
  }

  await sb.from("campaign_contacts").update({
    sms_status: "sent",
    sms_sent_at: new Date().toISOString(),
    sms_variant: smsVariant,
    last_step: "sms_sent",
  }).eq("id", contact.id);
  await bumpDailyStat("sms_sent");
  await logActivity(contact.id, "success", "sms_sent", `SMS delivered to ${contact.phone_e164}`);

  try {
    await sb.from("campaign_sent_log").insert({
      phone_e164: contact.phone_e164,
      channel: "sms",
      contact_id: contact.id,
      lead_id: contact.lead_id || null,
    });
  } catch (_) { /* dup ok */ }

  return { ok: true };
}

// ---------- Process a single contact (production) ----------
// Email and SMS run in PARALLEL on independent timers. SMS will go through even
// if the email step is delayed, retried, or rate-limited. Both channels enforce
// their own duplicate-suppression and 5-25s randomized back-to-back gap.
async function processContact(contact: any) {
  const [emailRes, smsRes] = await Promise.all([
    runEmailFor(contact),
    runSmsFor(contact),
  ]);

  // Final contact status — completed if either channel succeeded, failed only if both failed (and neither was skipped-duplicate)
  let finalStatus = "completed";
  if (!emailRes.ok && !smsRes.ok && !emailRes.skipped && !smsRes.skipped) {
    finalStatus = "failed";
  }
  await sb.from("campaign_contacts").update({ status: finalStatus, last_step: "completed" }).eq("id", contact.id);

  if (contact.lead_id) {
    await sb.from("state_leads").update({ last_contacted_at: new Date().toISOString() }).eq("id", contact.lead_id);
  }
  return { ok: emailRes.ok || smsRes.ok };
}

// ---------- Test runner ----------
async function runTest(payload: any) {
  const { email, phone, first_name, property_address, channel = "both" } = payload;
  const firstName = first_name || "there";
  const addr = property_address || "your test property";

  const result: any = { is_test: true, started_at: new Date().toISOString(), steps: [] };

  if (channel === "email" || channel === "both") {
    if (!email) return { ok: false, error: "missing_test_email" };
    const { subject, body } = buildEmail(firstName, addr);
    result.steps.push({ step: "email_preview", subject, body });
    const er = await sendEmail(email, subject, body);
    result.steps.push({ step: "email_send", ok: er.ok, error: er.error, id: er.id });
    await logActivity(null, er.ok ? "success" : "error", "test_email", `TEST email → ${email}: ${er.ok ? "ok" : er.error}`, true);
  }

  if (channel === "sms" || channel === "both") {
    if (!phone) return { ok: false, error: "missing_test_phone" };
    const { text } = buildSms(firstName, addr);
    result.steps.push({ step: "sms_preview", text });
    const sr = await sendSms(phone, text);
    result.steps.push({ step: "sms_send", ok: sr.ok, error: sr.error });
    await logActivity(null, sr.ok ? "success" : "error", "test_sms", `TEST sms → ${phone}: ${sr.ok ? "ok" : sr.error}`, true);
  }

  result.finished_at = new Date().toISOString();
  result.ok = true;
  return result;
}

// ---------- Tick: pull batch + process ----------
// runMode:
//   "single" → process at most 1 contact (used by Resume button — sends 1 at a time)
//   "batch"  → process up to settings.batch_size contacts in one invocation
//   "drain"  → keep looping batches until daily cap hit, no eligible leads, stop_requested,
//              paused, outside hours, or wall-clock budget exceeded (~5 min per invocation)
async function runTick(runMode: "single" | "batch" | "drain" = "batch", force = false) {
  const { data: settings } = await sb.from("campaign_settings").select("*").eq("id", 1).maybeSingle();
  if (!settings) return { ok: false, error: "no_settings" };
  if (!settings.is_production) return { ok: false, skipped: true, reason: "production_disabled" };
  if (settings.is_paused) return { ok: false, skipped: true, reason: "paused" };

  if (!force) {
    const sched = isBusinessHours(settings.start_hour_pt, settings.end_hour_pt);
    if (!sched.ok) return { ok: false, skipped: true, reason: sched.reason };
  }

  const driveStart = Date.now();
  const DRIVE_BUDGET_MS = 5 * 60 * 1000; // edge function wall-clock cap per invocation
  let totalProcessed = 0;
  let totalSuccess = 0;
  const reasons: string[] = [];

  if (runMode === "drain") {
    await sb.from("campaign_settings").update({
      drain_active: true,
      drain_started_at: new Date().toISOString(),
      stop_requested: false,
    }).eq("id", 1);
    await logActivity(null, "info", "drain_start", "Run Batch Now started — draining until cap, empty, or stop");
  }

  // ---- Inner: one batch pass ----
  async function onePass(passSize: number): Promise<{ done: boolean; reason: string; processed: number; success: number }> {
    // Re-read live settings each pass so Stop / Pause take effect mid-drain
    const { data: live } = await sb.from("campaign_settings").select("*").eq("id", 1).maybeSingle();
    if (!live) return { done: true, reason: "no_settings", processed: 0, success: 0 };
    if (live.stop_requested) return { done: true, reason: "stop_requested", processed: 0, success: 0 };
    if (live.is_paused) return { done: true, reason: "paused", processed: 0, success: 0 };
    if (!force) {
      const sch = isBusinessHours(live.start_hour_pt, live.end_hour_pt);
      if (!sch.ok) return { done: true, reason: sch.reason, processed: 0, success: 0 };
    }

    const today = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }))
      .toISOString().slice(0, 10);
    const { data: stats } = await sb.from("campaign_daily_stats").select("*").eq("campaign_date", today).maybeSingle();
    const emailsToday = stats?.emails_sent || 0;
    const smsToday = stats?.sms_sent || 0;
    if (emailsToday >= live.daily_email_cap && smsToday >= live.daily_sms_cap) {
      return { done: true, reason: "daily_cap_reached", processed: 0, success: 0 };
    }

    // Failure-rate failsafe
    const totalAttempts = emailsToday + (stats?.emails_failed || 0);
    if (totalAttempts > 50) {
      const failurePct = ((stats?.emails_failed || 0) + (stats?.sms_failed || 0)) * 100 /
        Math.max(1, totalAttempts + smsToday + (stats?.sms_failed || 0));
      if (failurePct > live.failure_threshold_pct) {
        await sb.from("campaign_settings").update({ is_paused: true }).eq("id", 1);
        await logActivity(null, "error", "auto_pause", `Auto-paused: failure rate ${failurePct.toFixed(1)}% > threshold ${live.failure_threshold_pct}%`);
        return { done: true, reason: "auto_paused_failure_rate", processed: 0, success: 0 };
      }
    }

    const effectiveEmailCap = Math.min(live.daily_email_cap, GMAIL_HARD_DAILY_CAP);
    const remainingEmails = Math.max(0, effectiveEmailCap - emailsToday);
    const batchSize = Math.min(passSize, remainingEmails);
    if (batchSize === 0) return { done: true, reason: "email_cap_reached", processed: 0, success: 0 };

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: leads, error: leadErr } = await sb
      .from("state_leads")
      .select("id, email, phone_e164, first_name, property_address, city, state, zip")
      .not("email", "is", null)
      .not("phone_e164", "is", null)
      .or(`last_contacted_at.is.null,last_contacted_at.lt.${thirtyDaysAgo}`)
      .limit(batchSize * 5);

    if (leadErr) return { done: true, reason: `lead_err:${leadErr.message}`, processed: 0, success: 0 };
    if (!leads || leads.length === 0) return { done: true, reason: "no_eligible_leads", processed: 0, success: 0 };

    const validatedLeads = leads.filter(l => emailLooksValid(l.email));

    // Filter classic suppression list
    const emails = validatedLeads.map(l => l.email).filter(Boolean);
    const phones = validatedLeads.map(l => l.phone_e164).filter(Boolean);
    const suppressionFilter: string[] = [];
    if (emails.length) suppressionFilter.push(`email.in.(${emails.map(e => `"${e}"`).join(",")})`);
    if (phones.length) suppressionFilter.push(`phone_e164.in.(${phones.map(p => `"${p}"`).join(",")})`);
    const { data: suppressed } = suppressionFilter.length
      ? await sb.from("suppression_list").select("email, phone_e164").or(suppressionFilter.join(","))
      : { data: [] as any[] };
    const suppressedEmails = new Set((suppressed || []).map(s => s.email).filter(Boolean));
    const suppressedPhones = new Set((suppressed || []).map(s => s.phone_e164).filter(Boolean));

    // PERMANENT sent log — anyone here is never re-sent again, ever
    const sentLogFilter: string[] = [];
    if (emails.length) sentLogFilter.push(`email.in.(${emails.map(e => `"${e}"`).join(",")})`);
    if (phones.length) sentLogFilter.push(`phone_e164.in.(${phones.map(p => `"${p}"`).join(",")})`);
    const { data: sentLog } = sentLogFilter.length
      ? await sb.from("campaign_sent_log").select("email, phone_e164").or(sentLogFilter.join(","))
      : { data: [] as any[] };
    const sentEmails = new Set((sentLog || []).map((s: any) => (s.email || "").toLowerCase()).filter(Boolean));
    const sentPhones = new Set((sentLog || []).map((s: any) => s.phone_e164).filter(Boolean));

    // Filter contacts already queued today
    const { data: alreadyQueued } = await sb
      .from("campaign_contacts")
      .select("email, phone_e164")
      .eq("campaign_date", today);
    const queuedEmails = new Set((alreadyQueued || []).map(c => c.email).filter(Boolean));
    const queuedPhones = new Set((alreadyQueued || []).map(c => c.phone_e164).filter(Boolean));

    const domainCountToday = new Map<string, number>();
    for (const c of (alreadyQueued || [])) {
      if (c.email) {
        const d = emailDomain(c.email);
        domainCountToday.set(d, (domainCountToday.get(d) || 0) + 1);
      }
    }

    const eligible: typeof validatedLeads = [];
    for (const l of validatedLeads) {
      if (suppressedEmails.has(l.email)) continue;
      if (suppressedPhones.has(l.phone_e164)) continue;
      if (sentEmails.has((l.email || "").toLowerCase())) continue;
      if (sentPhones.has(l.phone_e164)) continue;
      if (queuedEmails.has(l.email)) continue;
      if (queuedPhones.has(l.phone_e164)) continue;
      const d = emailDomain(l.email);
      const used = domainCountToday.get(d) || 0;
      const cap = FREE_PROVIDER_THROTTLE.has(d) ? Math.min(GMAIL_PER_DOMAIN_DAILY_CAP, 15) : GMAIL_PER_DOMAIN_DAILY_CAP;
      if (used >= cap) continue;
      domainCountToday.set(d, used + 1);
      eligible.push(l);
      if (eligible.length >= batchSize) break;
    }

    if (eligible.length === 0) return { done: true, reason: "all_filtered", processed: 0, success: 0 };

    const toInsert = eligible.map(l => ({
      lead_id: l.id,
      email: l.email,
      phone_e164: l.phone_e164,
      first_name: l.first_name,
      property_address: l.property_address,
      city: l.city,
      state: l.state,
      status: "queued",
    }));
    const { data: inserted, error: insErr } = await sb.from("campaign_contacts").insert(toInsert).select();
    if (insErr) return { done: true, reason: `ins_err:${insErr.message}`, processed: 0, success: 0 };

    let successCount = 0;
    for (const contact of inserted || []) {
      // Re-check stop signal between every contact
      const { data: stopCheck } = await sb.from("campaign_settings").select("stop_requested, is_paused").eq("id", 1).maybeSingle();
      if (stopCheck?.stop_requested || stopCheck?.is_paused) {
        return { done: true, reason: "stop_requested_mid_batch", processed: successCount, success: successCount };
      }
      const r = await processContact(contact);
      if (r.ok) successCount++;
      const delay = (live.min_delay_seconds + Math.floor(Math.random() * Math.max(1, live.max_delay_seconds - live.min_delay_seconds))) * 1000;
      await new Promise(res => setTimeout(res, delay));
      await sb.from("campaign_settings").update({ drain_last_tick_at: new Date().toISOString() }).eq("id", 1);
    }

    return { done: false, reason: "ok", processed: inserted?.length || 0, success: successCount };
  }

  // ---- Mode dispatch ----
  if (runMode === "single") {
    const r = await onePass(1);
    return { ok: true, mode: "single", processed: r.processed, success: r.success, reason: r.reason };
  }

  if (runMode === "batch") {
    const r = await onePass(settings.batch_size);
    return { ok: true, mode: "batch", processed: r.processed, success: r.success, reason: r.reason };
  }

  // drain
  while (Date.now() - driveStart < DRIVE_BUDGET_MS) {
    const r = await onePass(settings.batch_size);
    totalProcessed += r.processed;
    totalSuccess += r.success;
    reasons.push(r.reason);
    if (r.done) break;
  }
  await sb.from("campaign_settings").update({
    drain_active: false,
    stop_requested: false,
  }).eq("id", 1);
  await logActivity(null, "info", "drain_end", `Drain ended — processed ${totalProcessed}, success ${totalSuccess}, last reason: ${reasons[reasons.length - 1] || "n/a"}`);
  return { ok: true, mode: "drain", processed: totalProcessed, success: totalSuccess, last_reason: reasons[reasons.length - 1] };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    let payload: any = {};
    if (req.method === "POST") {
      try { payload = await req.json(); } catch {}
    }
    const mode = payload.mode || "tick";

    if (mode === "test") {
      const result = await runTest(payload);
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (mode === "preview") {
      const firstName = payload.first_name || "there";
      const addr = payload.property_address || "your property";
      const { subject, body, variant } = buildEmail(firstName, addr);
      const { text } = buildSms(firstName, addr);
      return new Response(JSON.stringify({
        ok: true,
        email: { subject, body, variant },
        sms: { text },
        sample: { first_name: firstName, property_address: addr },
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (mode === "stop") {
      await sb.from("campaign_settings").update({ stop_requested: true, is_paused: true }).eq("id", 1);
      await logActivity(null, "info", "stop_requested", "Stop requested by user — drain will halt after current contact");
      return new Response(JSON.stringify({ ok: true, stopped: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // tick mode → runMode controls behavior:
    //   "single" (Resume = 1 at a time) | "batch" (default cron) | "drain" (Run Batch Now)
    const runMode = (payload.runMode === "single" || payload.runMode === "drain")
      ? payload.runMode : "batch";

    // Manual triggers (single / drain) bypass the 9-5 PT window unless explicitly disabled.
    // The autonomous cron (batch) still respects business hours.
    const force = payload.force === true
      || (runMode !== "batch" && payload.force !== false);

    // For long-running drain, fire and forget so the HTTP request returns immediately
    if (runMode === "drain") {
      // @ts-ignore — Deno EdgeRuntime
      if (typeof EdgeRuntime !== "undefined" && (EdgeRuntime as any).waitUntil) {
        (EdgeRuntime as any).waitUntil(runTick("drain", force));
      } else {
        runTick("drain", force);
      }
      return new Response(JSON.stringify({ ok: true, mode: "drain", started: true, force }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const result = await runTick(runMode as any, force);
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

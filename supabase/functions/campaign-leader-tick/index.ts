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

// ---------- Email variation pool ----------
const SUBJECT_VARIANTS = [
  "Quick idea for your listing on {{addr}}",
  "Opportunity for your listing at {{addr}}",
  "Marketing idea for {{addr}}",
  "Question about your property at {{addr}}",
  "Thought about {{addr}}",
  "Quick note re: {{addr}}",
  "An idea for {{addr}}",
];

const EMAIL_INTROS = [
  "I came across your listing at {{addr}} and wanted to reach out with a quick idea.",
  "Saw your listing for {{addr}} and had a thought I wanted to share.",
  "Your listing at {{addr}} caught my eye — I wanted to send over a quick idea.",
  "Noticed your active listing at {{addr}} and figured this might be useful.",
  "I noticed {{addr}} on the market and wanted to share something that might help.",
];

const EMAIL_PITCHES = [
  "I specialize in AI-powered property marketing — drone-style visuals created without needing to physically walk the property.",
  "I create AI-driven cinematic property videos that don't require a physical walk-through.",
  "My work uses AI to produce drone-style marketing videos directly from existing photos — no on-site visit needed.",
  "I produce AI-generated marketing videos for listings using only the photos already on the MLS.",
];

const EMAIL_CTAS = [
  "If you're open, I'd love to create a sample video for {{addr}}. I'm offering a 50% discount for first-time clients.",
  "Happy to put together a free preview for {{addr}} — first-time clients get 50% off.",
  "Would you be open to a quick demo for {{addr}}? First-timers get half off.",
  "Let me know if I can put together a quick preview — 50% off your first one.",
];

const SMS_OPENERS = [
  "Hi {{name}}, this is Warren Guru. Just emailed you about your listing at {{addr}}",
  "Hey {{name}}, Warren Guru here. Sent you a quick email about {{addr}}",
  "Hi {{name}}, this is Warren Guru — reached out via email about {{addr}}",
  "Hey {{name}}, Warren here. I just emailed you about your listing at {{addr}}",
];

const SMS_BODIES = [
  "I would like to create an AI-powered property video for {{addr}} without needing to walk the home.",
  "I would like to make an AI-driven listing video for {{addr}} — no walk-through required.",
  "I would like to produce an AI marketing video for {{addr}} straight from your existing photos.",
];

const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
const pickIdx = <T,>(arr: T[]) => Math.floor(Math.random() * arr.length);
const fill = (tpl: string, vars: Record<string, string>) =>
  tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");

function buildEmail(firstName: string, addr: string) {
  const sIdx = pickIdx(SUBJECT_VARIANTS);
  const iIdx = pickIdx(EMAIL_INTROS);
  const pIdx = pickIdx(EMAIL_PITCHES);
  const cIdx = pickIdx(EMAIL_CTAS);
  const vars = { addr, name: firstName };
  const subject = fill(SUBJECT_VARIANTS[sIdx], vars);

  const intro = fill(EMAIL_INTROS[iIdx], vars);
  const pitch = EMAIL_PITCHES[pIdx];
  const cta = fill(EMAIL_CTAS[cIdx], vars);

  const body = [
    `<p style="margin:0 0 14px 0;">Hello ${firstName},</p>`,
    `<p style="margin:0 0 14px 0;">My name is Warren Guru. ${intro}</p>`,
    `<p style="margin:0 0 14px 0;">${pitch}</p>`,
    `<p style="margin:0 0 14px 0;">You can see a sample of my work here: <a href="https://instagram.com/W4RR3NGuru">instagram.com/W4RR3NGuru</a></p>`,
    `<p style="margin:0 0 14px 0;">${cta}</p>`,
    `<p style="margin:0 0 4px 0;">Best regards,</p>`,
    `<p style="margin:0 0 2px 0;">Warren Guru</p>`,
    `<p style="margin:0;"><a href="tel:+14802200405" style="color:#555;text-decoration:none;">(480) 220-0405</a></p>`,
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
  const text = `${opener}. ${body} See: https://instagram.com/W4RR3NGuru`;
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

// ---------- Process a single contact (production) ----------
async function processContact(contact: any) {
  const firstName = contact.first_name || "there";
  const addr = contact.property_address || "your property";

  // EMAIL step
  await sb.from("campaign_contacts").update({ status: "emailing", last_step: "emailing" }).eq("id", contact.id);
  await logActivity(contact.id, "info", "emailing", `Sending email to ${contact.email}`);

  const { subject, body, variant: emailVariant } = buildEmail(firstName, addr);
  const emailResult = await sendEmail(contact.email, subject, body);

  if (!emailResult.ok) {
    await sb.from("campaign_contacts").update({
      status: "failed",
      email_status: "failed",
      error_message: String(emailResult.error).slice(0, 500),
      last_step: "email_failed",
    }).eq("id", contact.id);
    await bumpDailyStat("emails_failed");
    await logActivity(contact.id, "error", "email_failed", String(emailResult.error));

    // Gmail deliverability promoter: auto-pause on rate-limit / quota errors
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

  // Small jitter between email and SMS
  await new Promise(r => setTimeout(r, 1500 + Math.floor(Math.random() * 2500)));

  // SMS step (only if we have phone)
  if (contact.phone_e164) {
    await sb.from("campaign_contacts").update({ status: "texting", last_step: "texting" }).eq("id", contact.id);
    const { text, variant: smsVariant } = buildSms(firstName, addr);
    const smsResult = await sendSms(contact.phone_e164, text);

    if (!smsResult.ok) {
      await sb.from("campaign_contacts").update({
        status: "failed",
        sms_status: "failed",
        error_message: String(smsResult.error).slice(0, 500),
        last_step: "sms_failed",
      }).eq("id", contact.id);
      await bumpDailyStat("sms_failed");
      await logActivity(contact.id, "error", "sms_failed", String(smsResult.error));
      return { ok: false };
    }

    await sb.from("campaign_contacts").update({
      status: "completed",
      sms_status: "sent",
      sms_sent_at: new Date().toISOString(),
      sms_variant: smsVariant,
      last_step: "completed",
    }).eq("id", contact.id);
    await bumpDailyStat("sms_sent");
    await logActivity(contact.id, "success", "completed", `SMS delivered to ${contact.phone_e164}`);
  } else {
    await sb.from("campaign_contacts").update({ status: "completed", last_step: "completed" }).eq("id", contact.id);
    await logActivity(contact.id, "info", "completed", "Completed (no phone available)");
  }

  // Stamp the source lead so we don't re-pull it
  if (contact.lead_id) {
    await sb.from("state_leads").update({ last_contacted_at: new Date().toISOString() }).eq("id", contact.lead_id);
  }
  return { ok: true };
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
async function runTick() {
  const { data: settings } = await sb.from("campaign_settings").select("*").eq("id", 1).maybeSingle();
  if (!settings) return { ok: false, error: "no_settings" };
  if (!settings.is_production) return { ok: false, skipped: true, reason: "production_disabled" };
  if (settings.is_paused) return { ok: false, skipped: true, reason: "paused" };

  const sched = isBusinessHours(settings.start_hour_pt, settings.end_hour_pt);
  if (!sched.ok) return { ok: false, skipped: true, reason: sched.reason };

  // Daily caps
  const today = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }))
    .toISOString().slice(0, 10);
  const { data: stats } = await sb.from("campaign_daily_stats").select("*").eq("campaign_date", today).maybeSingle();
  const emailsToday = stats?.emails_sent || 0;
  const smsToday = stats?.sms_sent || 0;
  if (emailsToday >= settings.daily_email_cap && smsToday >= settings.daily_sms_cap) {
    return { ok: false, skipped: true, reason: "daily_cap_reached" };
  }

  // Failure-rate failsafe (today)
  const totalAttempts = emailsToday + (stats?.emails_failed || 0);
  if (totalAttempts > 50) {
    const failurePct = ((stats?.emails_failed || 0) + (stats?.sms_failed || 0)) * 100 /
      Math.max(1, totalAttempts + smsToday + (stats?.sms_failed || 0));
    if (failurePct > settings.failure_threshold_pct) {
      // auto-pause
      await sb.from("campaign_settings").update({ is_paused: true }).eq("id", 1);
      await logActivity(null, "error", "auto_pause", `Auto-paused: failure rate ${failurePct.toFixed(1)}% > threshold ${settings.failure_threshold_pct}%`);
      return { ok: false, skipped: true, reason: "auto_paused_failure_rate" };
    }
  }

  // Pull eligible leads not already queued today
  // Gmail deliverability promoter: enforce hard daily cap below Workspace's 2k limit
  const effectiveEmailCap = Math.min(settings.daily_email_cap, GMAIL_HARD_DAILY_CAP);
  const remainingEmails = Math.max(0, effectiveEmailCap - emailsToday);
  const batchSize = Math.min(settings.batch_size, remainingEmails);
  if (batchSize === 0) return { ok: false, skipped: true, reason: "email_cap_reached" };

  // Get leads with email + phone, not contacted in 30 days, not in suppression
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: leads, error: leadErr } = await sb
    .from("state_leads")
    .select("id, email, phone_e164, first_name, property_address, city, state, zip")
    .not("email", "is", null)
    .not("phone_e164", "is", null)
    .or(`last_contacted_at.is.null,last_contacted_at.lt.${thirtyDaysAgo}`)
    .limit(batchSize * 5); // overfetch to filter suppression + invalid + domain throttle

  if (leadErr) return { ok: false, error: leadErr.message };
  if (!leads || leads.length === 0) return { ok: true, skipped: true, reason: "no_eligible_leads" };

  // Gmail promoter: drop role addresses + syntactically invalid emails BEFORE suppression query
  const validatedLeads = leads.filter(l => emailLooksValid(l.email));

  // Filter suppression
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

  // Filter contacts already queued/sent today
  const { data: alreadyQueued } = await sb
    .from("campaign_contacts")
    .select("email, phone_e164")
    .eq("campaign_date", today);
  const queuedEmails = new Set((alreadyQueued || []).map(c => c.email).filter(Boolean));
  const queuedPhones = new Set((alreadyQueued || []).map(c => c.phone_e164).filter(Boolean));

  // Gmail promoter: per-domain daily throttle — count today's already-queued emails per domain
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
    if (queuedEmails.has(l.email)) continue;
    if (queuedPhones.has(l.phone_e164)) continue;
    const d = emailDomain(l.email);
    const used = domainCountToday.get(d) || 0;
    // Apply per-domain throttle, with stricter cap on free providers
    const cap = FREE_PROVIDER_THROTTLE.has(d) ? Math.min(GMAIL_PER_DOMAIN_DAILY_CAP, 15) : GMAIL_PER_DOMAIN_DAILY_CAP;
    if (used >= cap) continue;
    domainCountToday.set(d, used + 1);
    eligible.push(l);
    if (eligible.length >= batchSize) break;
  }

  if (eligible.length === 0) return { ok: true, skipped: true, reason: "all_filtered" };

  // Insert as queued
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
  if (insErr) return { ok: false, error: insErr.message };

  // Process serially with delay
  let successCount = 0;
  for (const contact of inserted || []) {
    const r = await processContact(contact);
    if (r.ok) successCount++;
    const delay = (settings.min_delay_seconds + Math.floor(Math.random() * (settings.max_delay_seconds - settings.min_delay_seconds))) * 1000;
    await new Promise(res => setTimeout(res, delay));
  }

  return { ok: true, processed: inserted?.length || 0, success: successCount };
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

    const result = await runTick();
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

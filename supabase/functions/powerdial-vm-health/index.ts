// Health-check + background retry queue: verifies every voicemail drop has a
// VoidFix follow-up SMS, retries failures with exponential backoff, and emits
// a recovery notification once a previously-failed retry succeeds.
//
// Modes:
//   GET                              -> summary + missing rows for last N hours
//   POST { repair: true }            -> manually retry every missing row right now
//   POST { auto: true }              -> background pass: only retry rows whose
//                                       meta.vm_sms_retry.next_at is due
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// Exponential backoff schedule (minutes) capped at MAX_ATTEMPTS retries.
// attempt 1 -> wait 2m, attempt 2 -> 5m, attempt 3 -> 15m, attempt 4 -> 60m, attempt 5 -> 240m.
const BACKOFF_MIN = [2, 5, 15, 60, 240];
const MAX_ATTEMPTS = BACKOFF_MIN.length;

interface MissingRow {
  call_log_id: string;
  phone: string;
  campaign_id: string | null;
  customer_id: string | null;
  voicemail_dropped_at: string;
  age_minutes: number;
  sms_status: string | null;
  last_error?: string;
  retry?: { attempts: number; next_at: string | null; last_error?: string | null };
}

const DEFAULT_TEXT = "";

async function notifyRecovery(
  supa: ReturnType<typeof createClient>,
  row: { call_log_id: string; phone: string; attempts: number; lastError: string | null },
) {
  // Push into activity_log so the existing telegram-notify trigger fires.
  try {
    await supa.from("activity_log").insert({
      entity_type: "vm_sms_repair",
      entity_id: row.call_log_id,
      action: "recovered",
      meta: {
        message: `✅ *VoidFix VM SMS recovered*\n📞 ${row.phone}\nrecovered after ${row.attempts} retry attempt(s).` +
          (row.lastError ? `\nlast error: ${row.lastError}` : ""),
        phone: row.phone,
        attempts: row.attempts,
        last_error: row.lastError,
      },
    });
  } catch (e) {
    console.error("[vm-health] notifyRecovery failed:", e);
  }
}

async function notifyExhausted(
  supa: ReturnType<typeof createClient>,
  row: { call_log_id: string; phone: string; attempts: number; lastError: string | null },
) {
  try {
    await supa.from("activity_log").insert({
      entity_type: "vm_sms_repair",
      entity_id: row.call_log_id,
      action: "exhausted",
      meta: {
        message: `🚨 *VoidFix VM SMS giving up*\n📞 ${row.phone}\nfailed after ${row.attempts} attempts.` +
          (row.lastError ? `\nlast error: ${row.lastError}` : ""),
        phone: row.phone,
        attempts: row.attempts,
        last_error: row.lastError,
      },
    });
  } catch (e) {
    console.error("[vm-health] notifyExhausted failed:", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supa = createClient(SUPABASE_URL, SERVICE_ROLE);

  let repair = false;
  let auto = false;
  let lookbackHours = 24;
  let graceMinutes = 2;

  if (req.method === "POST") {
    try {
      const body = await req.json();
      repair = body?.repair === true;
      auto = body?.auto === true;
      if (typeof body?.lookbackHours === "number") lookbackHours = body.lookbackHours;
      if (typeof body?.graceMinutes === "number") graceMinutes = body.graceMinutes;
    } catch (_) { /* ignore */ }
  } else {
    const url = new URL(req.url);
    if (url.searchParams.get("lookbackHours")) lookbackHours = Number(url.searchParams.get("lookbackHours"));
    if (url.searchParams.get("auto") === "1") auto = true;
  }

  const since = new Date(Date.now() - lookbackHours * 3600_000).toISOString();
  const cutoff = new Date(Date.now() - graceMinutes * 60_000).toISOString();
  const nowMs = Date.now();

  const { data: drops, error: dropsErr } = await supa
    .from("powerdial_call_logs")
    .select(
      "id, phone, campaign_id, customer_id, voicemail_drop_completed_at, voicemail_drop_sms_sent_at, voicemail_drop_sms_status, meta",
    )
    .not("voicemail_drop_completed_at", "is", null)
    .gte("voicemail_drop_completed_at", since)
    .order("voicemail_drop_completed_at", { ascending: false });

  if (dropsErr) {
    return new Response(JSON.stringify({ error: dropsErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const total = drops?.length ?? 0;
  const sent = (drops ?? []).filter((d: any) => !!d.voicemail_drop_sms_sent_at).length;
  const sending = (drops ?? []).filter((d: any) => d.voicemail_drop_sms_status === "sending").length;
  const failed = (drops ?? []).filter((d: any) => d.voicemail_drop_sms_status === "failed").length;

  const missing: MissingRow[] = (drops ?? [])
    .filter((d: any) =>
      !d.voicemail_drop_sms_sent_at &&
      d.voicemail_drop_completed_at &&
      d.voicemail_drop_completed_at < cutoff
    )
    .map((d: any) => {
      const r = (d.meta as any)?.vm_sms_retry;
      return {
        call_log_id: d.id,
        phone: d.phone,
        campaign_id: d.campaign_id,
        customer_id: d.customer_id,
        voicemail_dropped_at: d.voicemail_drop_completed_at,
        age_minutes: Math.round(
          (nowMs - new Date(d.voicemail_drop_completed_at).getTime()) / 60000,
        ),
        sms_status: d.voicemail_drop_sms_status,
        last_error: (d.meta as any)?.voicemail_drop_sms_error ?? r?.last_error ?? undefined,
        retry: r ? { attempts: r.attempts ?? 0, next_at: r.next_at ?? null, last_error: r.last_error ?? null } : undefined,
      };
    });

  // Pick which rows to actually attempt.
  let toAttempt: MissingRow[] = [];
  if (repair) {
    // Manual full retry — try every missing row regardless of backoff schedule.
    toAttempt = missing;
  } else if (auto) {
    // Background pass — only rows whose retry schedule is due (or never tried),
    // and we haven't blown past MAX_ATTEMPTS.
    toAttempt = missing.filter((m) => {
      const attempts = m.retry?.attempts ?? 0;
      if (attempts >= MAX_ATTEMPTS) return false;
      if (!m.retry?.next_at) return true;
      return new Date(m.retry.next_at).getTime() <= nowMs;
    });
  }

  const repairs: Array<{ call_log_id: string; ok: boolean; error?: string; attempts: number; recovered?: boolean; exhausted?: boolean }> = [];

  if (toAttempt.length) {
    const campaignIds = Array.from(new Set(toAttempt.map((m) => m.campaign_id).filter(Boolean))) as string[];
    const campaignMap = new Map<string, any>();
    if (campaignIds.length) {
      const { data: campaigns } = await supa
        .from("powerdial_campaigns")
        .select("id, settings")
        .in("id", campaignIds);
      (campaigns ?? []).forEach((c: any) => campaignMap.set(c.id, c.settings ?? {}));
    }

    // Re-fetch fresh meta for atomic update so we don't clobber concurrent writes.
    const ids = toAttempt.map((m) => m.call_log_id);
    const { data: freshRows } = await supa
      .from("powerdial_call_logs")
      .select("id, meta")
      .in("id", ids);
    const metaMap = new Map<string, any>();
    (freshRows ?? []).forEach((r: any) => metaMap.set(r.id, r.meta ?? {}));

    for (const m of toAttempt) {
      const settings = (m.campaign_id && campaignMap.get(m.campaign_id)) || {};
      const priorMeta = metaMap.get(m.call_log_id) ?? {};
      const priorRetry = priorMeta.vm_sms_retry ?? { attempts: 0, last_error: null, next_at: null };
      const priorAttempts = Number(priorRetry.attempts ?? 0);
      const wasFailing = priorAttempts > 0;

      if (settings?.voicemail_drop_sms_enabled !== true) {
        repairs.push({ call_log_id: m.call_log_id, ok: false, error: "sms disabled in campaign", attempts: priorAttempts });
        continue;
      }

      const text =
        (typeof settings?.voicemail_drop_sms_text === "string" && settings.voicemail_drop_sms_text.trim()) ||
        DEFAULT_TEXT;
      if (!text) {
        repairs.push({ call_log_id: m.call_log_id, ok: false, error: "sms text empty", attempts: priorAttempts });
        continue;
      }

      let ok = false;
      let errMsg: string | null = null;
      try {
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/powerdial-sms`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: ANON_KEY,
            Authorization: `Bearer ${SERVICE_ROLE}`,
          },
          body: JSON.stringify({
            action: "send",
            to: m.phone,
            body: text,
            customer_id: m.customer_id,
            source: "powerdial-voicemail-drop-sms",
            metadata: {
              voicemail_drop: true,
              repair: true,
              call_log_id: m.call_log_id,
              campaign_id: m.campaign_id,
              repair_source: auto ? "vm-health-auto-retry" : "vm-health-repair",
              attempt: priorAttempts + 1,
            },
          }),
        });
        const json = await resp.json().catch(() => ({}));
        ok = resp.ok && (json?.ok === true);
        if (!ok) errMsg = json?.error ?? `HTTP ${resp.status}`;
      } catch (e) {
        errMsg = String((e as Error).message ?? e);
      }

      const newAttempts = priorAttempts + 1;
      const exhausted = !ok && newAttempts >= MAX_ATTEMPTS;
      const nextAt = ok || exhausted
        ? null
        : new Date(nowMs + BACKOFF_MIN[Math.min(newAttempts, BACKOFF_MIN.length - 1)] * 60_000).toISOString();

      const newRetry = ok
        ? { attempts: newAttempts, next_at: null, last_error: null, recovered_at: new Date().toISOString() }
        : { attempts: newAttempts, next_at: nextAt, last_error: errMsg };

      const newMeta = { ...priorMeta, vm_sms_retry: newRetry };
      if (!ok && errMsg) newMeta.voicemail_drop_sms_error = errMsg;

      await supa
        .from("powerdial_call_logs")
        .update({
          voicemail_drop_sms_status: ok ? "sent" : "failed",
          voicemail_drop_sms_sent_at: ok ? new Date().toISOString() : null,
          meta: newMeta,
        })
        .eq("id", m.call_log_id);

      const recovered = ok && wasFailing;
      if (recovered) {
        await notifyRecovery(supa, {
          call_log_id: m.call_log_id,
          phone: m.phone,
          attempts: newAttempts,
          lastError: priorRetry.last_error ?? null,
        });
      }
      if (exhausted) {
        await notifyExhausted(supa, {
          call_log_id: m.call_log_id,
          phone: m.phone,
          attempts: newAttempts,
          lastError: errMsg,
        });
      }

      repairs.push({
        call_log_id: m.call_log_id,
        ok,
        error: ok ? undefined : errMsg ?? undefined,
        attempts: newAttempts,
        recovered,
        exhausted,
      });
    }
  }

  const healthy = missing.length === 0;
  const pendingRetries = missing.filter((m) => (m.retry?.attempts ?? 0) > 0 && (m.retry?.attempts ?? 0) < MAX_ATTEMPTS).length;
  const exhaustedCount = missing.filter((m) => (m.retry?.attempts ?? 0) >= MAX_ATTEMPTS).length;

  return new Response(
    JSON.stringify({
      healthy,
      mode: repair ? "manual-repair" : auto ? "auto-retry" : "check",
      lookbackHours,
      graceMinutes,
      checked_at: new Date().toISOString(),
      summary: {
        total,
        sent,
        sending,
        failed,
        missing: missing.length,
        pending_retries: pendingRetries,
        exhausted: exhaustedCount,
      },
      missing,
      repairs,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});

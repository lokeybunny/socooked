// Health-check: verifies every voicemail drop has a VoidFix follow-up SMS.
// GET  -> returns summary + missing rows for last N hours
// POST -> same, plus optional { repair: true } to retry sending the missing SMS via powerdial-sms
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

interface MissingRow {
  call_log_id: string;
  phone: string;
  campaign_id: string | null;
  customer_id: string | null;
  voicemail_dropped_at: string;
  age_minutes: number;
  sms_status: string | null;
  last_error?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supa = createClient(SUPABASE_URL, SERVICE_ROLE);

  let repair = false;
  let lookbackHours = 24;
  let graceMinutes = 2; // allow 2 min for the async send to complete

  if (req.method === "POST") {
    try {
      const body = await req.json();
      repair = body?.repair === true;
      if (typeof body?.lookbackHours === "number") lookbackHours = body.lookbackHours;
      if (typeof body?.graceMinutes === "number") graceMinutes = body.graceMinutes;
    } catch (_) { /* ignore */ }
  } else {
    const url = new URL(req.url);
    if (url.searchParams.get("lookbackHours")) lookbackHours = Number(url.searchParams.get("lookbackHours"));
  }

  const since = new Date(Date.now() - lookbackHours * 3600_000).toISOString();
  const cutoff = new Date(Date.now() - graceMinutes * 60_000).toISOString();

  // All VM drops in window
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
  const sent = (drops ?? []).filter((d) => !!d.voicemail_drop_sms_sent_at).length;
  const sending = (drops ?? []).filter((d) => d.voicemail_drop_sms_status === "sending").length;
  const failed = (drops ?? []).filter((d) => d.voicemail_drop_sms_status === "failed").length;

  const missing: MissingRow[] = (drops ?? [])
    .filter((d) =>
      !d.voicemail_drop_sms_sent_at &&
      d.voicemail_drop_completed_at &&
      d.voicemail_drop_completed_at < cutoff
    )
    .map((d) => ({
      call_log_id: d.id,
      phone: d.phone,
      campaign_id: d.campaign_id,
      customer_id: d.customer_id,
      voicemail_dropped_at: d.voicemail_drop_completed_at,
      age_minutes: Math.round(
        (Date.now() - new Date(d.voicemail_drop_completed_at).getTime()) / 60000,
      ),
      sms_status: d.voicemail_drop_sms_status,
      last_error: (d.meta as any)?.voicemail_drop_sms_error ?? undefined,
    }));

  const repairs: Array<{ call_log_id: string; ok: boolean; error?: string }> = [];

  if (repair && missing.length) {
    // load campaigns for default sms text
    const campaignIds = Array.from(new Set(missing.map((m) => m.campaign_id).filter(Boolean))) as string[];
    const campaignMap = new Map<string, any>();
    if (campaignIds.length) {
      const { data: campaigns } = await supa
        .from("powerdial_campaigns")
        .select("id, settings")
        .in("id", campaignIds);
      (campaigns ?? []).forEach((c) => campaignMap.set(c.id, c.settings ?? {}));
    }

    const DEFAULT_TEXT =
      "Hi this is Warren Guru. Just left you a voice mail, Im calling to see if you wouldn't mind having me make a video for one of your listings for free? Im a AI Videographer, Call me back at 702 701 6192.";

    for (const m of missing) {
      const settings = (m.campaign_id && campaignMap.get(m.campaign_id)) || {};
      if (settings?.voicemail_drop_sms_enabled === false) {
        repairs.push({ call_log_id: m.call_log_id, ok: false, error: "sms disabled in campaign" });
        continue;
      }
      const text =
        (typeof settings?.voicemail_drop_sms_text === "string" && settings.voicemail_drop_sms_text.trim()) ||
        DEFAULT_TEXT;

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
              repair_source: "vm-health-repair",
            },
          }),
        });
        const json = await resp.json().catch(() => ({}));
        const ok = resp.ok && json?.ok === true;
        await supa
          .from("powerdial_call_logs")
          .update({
            voicemail_drop_sms_status: ok ? "sent" : "failed",
            voicemail_drop_sms_sent_at: ok ? new Date().toISOString() : null,
            voicemail_drop_sms_error: ok ? null : (json?.error ?? `HTTP ${resp.status}`),
          })
          .eq("id", m.call_log_id);
        repairs.push({ call_log_id: m.call_log_id, ok, error: ok ? undefined : (json?.error ?? `HTTP ${resp.status}`) });
      } catch (e) {
        repairs.push({ call_log_id: m.call_log_id, ok: false, error: String((e as Error).message ?? e) });
      }
    }
  }

  const healthy = missing.length === 0;

  return new Response(
    JSON.stringify({
      healthy,
      lookbackHours,
      graceMinutes,
      checked_at: new Date().toISOString(),
      summary: { total, sent, sending, failed, missing: missing.length },
      missing,
      repairs,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});

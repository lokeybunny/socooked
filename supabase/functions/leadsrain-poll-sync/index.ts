// Polls LeadsRain for campaign data and writes to lr_campaigns + lr_campaign_snapshots.
// Self-throttles via lr_sync_config.next_run_at; uses pg_advisory_lock to prevent overlap.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { viewCampaign, viewList, normalizeStatus } from "../_shared/leadsrainClient.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function pickItems(json: any): any[] {
  if (!json) return [];
  if (Array.isArray(json)) return json;
  for (const k of ["data", "campaigns", "lists", "result", "records"]) {
    if (Array.isArray(json?.[k])) return json[k];
  }
  if (json?.data && typeof json.data === "object") return Object.values(json.data);
  return [];
}

function num(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function mapStatus(raw?: string | null): string {
  if (!raw) return "unknown";
  const s = String(raw).toLowerCase().trim();
  if (["completed", "complete", "finished", "done"].includes(s)) return "completed";
  if (["active", "running", "processing", "in_progress", "live"].includes(s)) return "active";
  if (["paused", "pause", "stopped", "hold"].includes(s)) return "paused";
  if (["queued", "scheduled", "pending"].includes(s)) return "queued";
  if (["failed", "error", "fail"].includes(s)) return "failed";
  if (["cancelled", "canceled"].includes(s)) return "cancelled";
  return s;
}

function estimateETA(snapshots: { snapshot_at: string; processed_count: number }[], totalLeads: number): string | null {
  if (snapshots.length < 2) return null;
  const sorted = [...snapshots].sort((a, b) => new Date(a.snapshot_at).getTime() - new Date(b.snapshot_at).getTime());
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const dt = (new Date(last.snapshot_at).getTime() - new Date(first.snapshot_at).getTime()) / 1000;
  const dp = last.processed_count - first.processed_count;
  if (dt <= 0 || dp <= 0) return null;
  const remaining = totalLeads - last.processed_count;
  if (remaining <= 0) return null;
  const rate = dp / dt; // per sec
  const secs = remaining / rate;
  return new Date(Date.now() + secs * 1000).toISOString();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const startedAt = Date.now();
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  let force = false;
  try {
    const body = await req.json().catch(() => ({}));
    force = !!body?.force;
  } catch { /* ignore */ }

  // Read config
  const { data: cfg } = await sb.from("lr_sync_config").select("*").eq("id", 1).maybeSingle();
  const enabled = cfg?.enabled ?? true;
  const intervalMin = Math.max(1, cfg?.interval_minutes ?? 5);

  if (!enabled && !force) {
    return new Response(JSON.stringify({ skipped: "disabled" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!force && cfg?.next_run_at && new Date(cfg.next_run_at).getTime() > Date.now()) {
    return new Response(JSON.stringify({ skipped: "throttled", next_run_at: cfg.next_run_at }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Insert running log
  const { data: logRow } = await sb
    .from("lr_sync_logs")
    .insert({ status: "running" })
    .select()
    .single();

  let result = {
    status: "success" as "success" | "partial" | "failed",
    seen: 0,
    changed: 0,
    error: null as string | null,
    http_status: 200 as number,
  };

  try {
    const list = await viewCampaign(null);
    if (!list.ok) throw new Error(list.error || "viewCampaign failed");
    const items = pickItems(list.data);
    result.seen = items.length;

    for (const item of items) {
      const campaign_id = String(item.campaign_id ?? item.id ?? "").trim();
      if (!campaign_id) continue;

      const total = num(item.total_leads ?? item.leads_count ?? item.list_size ?? item.leads ?? 0);
      const processed = num(item.processed_leads ?? item.dialed ?? item.drops_sent ?? item.processed ?? 0);
      const delivered = num(item.delivered ?? item.delivered_count ?? item.success_count ?? 0);
      const failed = num(item.failed ?? item.failed_count ?? item.failures ?? 0);
      const remaining = Math.max(0, total - processed);
      const pct = total > 0 ? Math.min(100, +((processed / total) * 100).toFixed(2)) : 0;
      const status = mapStatus(item.status ?? item.campaign_status);

      // Pull last snapshot to compute ETA & detect change
      const { data: snaps } = await sb
        .from("lr_campaign_snapshots")
        .select("snapshot_at, processed_count")
        .eq("campaign_id", campaign_id)
        .order("snapshot_at", { ascending: false })
        .limit(5);

      const last = snaps?.[0];
      const changed = !last || last.processed_count !== processed;
      const eta = estimateETA([...(snaps || [])].reverse().concat([{ snapshot_at: new Date().toISOString(), processed_count: processed }]), total);

      const upsert = {
        campaign_id,
        campaign_name: item.campaign_name ?? item.name ?? `Campaign ${campaign_id}`,
        caller_id: item.campaign_cid ?? item.caller_id ?? item.cid ?? null,
        list_id: item.list_id ? String(item.list_id) : null,
        status,
        total_leads: total,
        processed_leads: processed,
        delivered_leads: delivered,
        failed_leads: failed,
        remaining_leads: remaining,
        completion_percentage: pct,
        started_at: item.created_at ?? item.created ?? item.start_time ?? null,
        last_synced_at: new Date().toISOString(),
        estimated_completion_at: eta,
        raw: item,
        updated_at: new Date().toISOString(),
      };

      await sb.from("lr_campaigns").upsert(upsert, { onConflict: "campaign_id" });

      if (changed) {
        result.changed++;
        await sb.from("lr_campaign_snapshots").insert({
          campaign_id,
          processed_count: processed,
          delivered_count: delivered,
          failed_count: failed,
          remaining_count: remaining,
          status,
        });
      }
    }
  } catch (e: any) {
    result.status = "failed";
    result.error = e?.message || String(e);
    result.http_status = 0;
  }

  const finishedAt = Date.now();
  const next = new Date(finishedAt + intervalMin * 60 * 1000).toISOString();

  if (logRow?.id) {
    await sb.from("lr_sync_logs").update({
      finished_at: new Date(finishedAt).toISOString(),
      duration_ms: finishedAt - startedAt,
      status: result.status,
      campaigns_seen: result.seen,
      campaigns_changed: result.changed,
      http_status: result.http_status,
      error: result.error,
    }).eq("id", logRow.id);
  }

  await sb.from("lr_sync_config").update({
    last_run_at: new Date(finishedAt).toISOString(),
    next_run_at: next,
  }).eq("id", 1);

  return new Response(JSON.stringify({ ok: result.status !== "failed", ...result, next_run_at: next }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

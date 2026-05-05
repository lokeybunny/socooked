// Audit existing state_leads phone numbers via Twilio Lookup, with start/pause/resume tracking.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { lookupBatch } from "../_shared/twilio-lookup.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BATCH_SIZE = 200;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "start");
    const jobId = body.job_id ? String(body.job_id) : null;

    if (action === "status" && jobId) {
      const { data } = await supabase.from("phone_audit_jobs").select("*").eq("id", jobId).maybeSingle();
      return new Response(JSON.stringify({ job: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "pause" && jobId) {
      await supabase.from("phone_audit_jobs").update({
        status: "paused", paused_at: new Date().toISOString(),
      }).eq("id", jobId);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stateFilter = body.state ? String(body.state).toUpperCase() : null;
    const applyState = (q: any) => stateFilter ? q.eq("state", stateFilter) : q;

    if (action === "preview") {
      const totalQ = applyState(supabase.from("state_leads").select("*", { count: "exact", head: true }));
      const { count: totalLeads } = await totalQ;
      const cutoff = new Date(Date.now() - 30 * 86400_000).toISOString();
      const needQ = applyState(
        supabase.from("state_leads").select("*", { count: "exact", head: true })
          .or(`phone_lookup_checked_at.is.null,phone_lookup_checked_at.lt.${cutoff}`),
      );
      const { count: needAudit } = await needQ;
      const { count: cacheReady } = await supabase
        .from("phone_lookups")
        .select("*", { count: "exact", head: true })
        .gte("checked_at", cutoff);
      // Per-state breakdown for selector
      const { data: byState } = await supabase
        .from("state_leads")
        .select("state")
        .limit(50000);
      const stateCounts: Record<string, number> = {};
      (byState ?? []).forEach((r: any) => {
        if (r.state) stateCounts[r.state] = (stateCounts[r.state] ?? 0) + 1;
      });
      return new Response(JSON.stringify({
        total_leads: totalLeads ?? 0,
        need_audit: needAudit ?? 0,
        cache_ready: cacheReady ?? 0,
        estimated_cost_usd: Number(((needAudit ?? 0) * 0.008).toFixed(2)),
        states: Object.entries(stateCounts).map(([state, count]) => ({ state, count })).sort((a, b) => b.count - a.count),
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let job: any = null;
    if (action === "start") {
      const cutoff = new Date(Date.now() - 30 * 86400_000).toISOString();
      const needQ = applyState(
        supabase.from("state_leads").select("*", { count: "exact", head: true })
          .or(`phone_lookup_checked_at.is.null,phone_lookup_checked_at.lt.${cutoff}`),
      );
      const { count: needAudit } = await needQ;
      const { data } = await supabase.from("phone_audit_jobs").insert({
        status: "running", total: needAudit ?? 0, started_at: new Date().toISOString(),
      }).select("*").single();
      job = { ...data, _state: stateFilter };
    } else if (action === "resume" && jobId) {
      const { data } = await supabase.from("phone_audit_jobs").update({
        status: "running", paused_at: null,
      }).eq("id", jobId).select("*").single();
      job = data;
    }

    if (!job) {
      return new Response(JSON.stringify({ error: "no job" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Background loop
    const work = (async () => {
      const cutoff = new Date(Date.now() - 30 * 86400_000).toISOString();
      try {
        while (true) {
          // Re-read job state to honor pause
          const { data: current } = await supabase.from("phone_audit_jobs").select("*").eq("id", job.id).single();
          if (!current || current.status !== "running") return;

          // Pull next batch of un-audited leads
          const leadsQ = applyState(
            supabase.from("state_leads").select("id, phone_e164")
              .or(`phone_lookup_checked_at.is.null,phone_lookup_checked_at.lt.${cutoff}`)
              .limit(BATCH_SIZE),
          );
          const { data: leads, error } = await leadsQ;
          if (error) throw error;
          if (!leads?.length) {
            await supabase.from("phone_audit_jobs").update({
              status: "completed", completed_at: new Date().toISOString(),
            }).eq("id", job.id);
            return;
          }

          const numbers = leads.map((l) => l.phone_e164).filter(Boolean) as string[];
          const { results, cacheHits, newLookups } = await lookupBatch(supabase, numbers);

          let mobile = 0, landline = 0, voip = 0, invalid = 0, unknown = 0, failed = 0;
          const updates: Record<string, any[]> = {};
          for (const lead of leads) {
            const r = results[lead.phone_e164];
            if (!r) { failed++; continue; }
            if (r.status === "failed") { failed++; }
            else if (!r.valid) invalid++;
            else if (r.line_type === "mobile") mobile++;
            else if (r.line_type === "landline") landline++;
            else if (r.line_type === "voip") voip++;
            else unknown++;

            // Update lead
            await supabase.from("state_leads").update({
              phone_valid: r?.valid ?? false,
              phone_line_type: r?.line_type ?? null,
              phone_carrier: r?.carrier_name ?? null,
              phone_lookup_status: r?.status ?? "failed",
              phone_lookup_checked_at: new Date().toISOString(),
            }).eq("id", lead.id);
          }

          await supabase.from("phone_audit_jobs").update({
            processed: current.processed + leads.length,
            mobile: current.mobile + mobile,
            landline: current.landline + landline,
            voip: current.voip + voip,
            invalid: current.invalid + invalid,
            unknown: current.unknown + unknown,
            failed: current.failed + failed,
            cache_hits: current.cache_hits + cacheHits,
            new_lookups: current.new_lookups + newLookups,
            current_phone: numbers[numbers.length - 1] ?? null,
          }).eq("id", job.id);
        }
      } catch (e) {
        await supabase.from("phone_audit_jobs").update({
          status: "error", error_message: String((e as Error).message || e),
        }).eq("id", job.id);
      }
    })();

    // @ts-ignore
    if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(work);

    return new Response(JSON.stringify({ job }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

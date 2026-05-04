// Clean existing state_leads through LaGrowthMachine verify API.
// Scans existing rows in batches, drops invalid ones, enriches names where provided,
// and removes any pending campaign_contacts tied to dropped leads.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LGM_KEY = Deno.env.get("LAGROWTHMACHINE_API_KEY") || "";
const LGM_BASE = "https://apiv2.lagrowthmachine.com/flow";

async function lgmVerify(payload: { email?: string | null; phone?: string | null; firstName?: string | null; lastName?: string | null; }): Promise<{ ok: boolean; enrich?: Record<string, any>; reason?: string }> {
  if (!LGM_KEY) return { ok: true };
  if (!payload.email && !payload.phone) return { ok: true };
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 7000);
    const body: Record<string, any> = {};
    if (payload.email) body.email = payload.email;
    if (payload.phone) body.phone = payload.phone;
    if (payload.firstName) body.firstName = payload.firstName;
    if (payload.lastName) body.lastName = payload.lastName;
    const r = await fetch(`${LGM_BASE}/leads/verify?apikey=${encodeURIComponent(LGM_KEY)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (r.status === 429 || r.status >= 500) return { ok: true };
    const j = await r.json().catch(() => ({}));
    const valid = j?.valid === true || j?.verified === true || j?.status === "valid" || j?.status === "ok" || j?.email?.valid === true || j?.phone?.valid === true;
    const invalid = j?.valid === false || j?.verified === false || j?.status === "invalid" || j?.status === "rejected" || (j?.email?.valid === false && !payload.phone) || (j?.phone?.valid === false && !payload.email);
    if (invalid) return { ok: false, reason: j?.reason || j?.status || "invalid" };
    if (valid) {
      const enrich: Record<string, any> = {};
      if (j?.firstName && !payload.firstName) enrich.first_name = j.firstName;
      if (j?.lastName && !payload.lastName) enrich.last_name = j.lastName;
      return { ok: true, enrich };
    }
    return { ok: true };
  } catch {
    return { ok: true };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    const stateFilter: string | null = body?.state || null;
    const limit: number = Math.min(Number(body?.limit) || 500, 2000);
    const offset: number = Math.max(Number(body?.offset) || 0, 0);

    if (!LGM_KEY) {
      return new Response(JSON.stringify({ error: "LAGROWTHMACHINE_API_KEY not configured" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let q = sb.from("state_leads").select("id,phone_e164,email,first_name,name,state").order("created_at", { ascending: true }).range(offset, offset + limit - 1);
    if (stateFilter) q = q.eq("state", stateFilter);
    const { data: leads, error } = await q;
    if (error) throw error;

    const rejected: { id: string; phone_e164: string; email: string | null; reason?: string }[] = [];
    const enriched: { id: string; first_name?: string; last_name?: string }[] = [];
    let checked = 0;
    let kept = 0;

    for (const lead of leads || []) {
      checked++;
      const nameParts = (lead.name || "").trim().split(/\s+/);
      const lastFromName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : null;
      const verdict = await lgmVerify({
        email: lead.email,
        phone: lead.phone_e164,
        firstName: lead.first_name,
        lastName: lastFromName,
      });
      if (!verdict.ok) {
        rejected.push({ id: lead.id, phone_e164: lead.phone_e164, email: lead.email, reason: verdict.reason });
      } else {
        kept++;
        if (verdict.enrich && (verdict.enrich.first_name || verdict.enrich.last_name)) {
          const updates: Record<string, any> = {};
          if (verdict.enrich.first_name && !lead.first_name) updates.first_name = verdict.enrich.first_name;
          if (Object.keys(updates).length) {
            await sb.from("state_leads").update(updates).eq("id", lead.id);
            enriched.push({ id: lead.id, ...updates });
          }
        }
      }
    }

    let removedCampaignContacts = 0;
    if (rejected.length) {
      const ids = rejected.map((r) => r.id);
      // Remove pending/queued campaign_contacts for rejected leads
      const { data: removed } = await sb
        .from("campaign_contacts")
        .delete()
        .in("lead_id", ids)
        .in("status", ["queued", "pending", "rejected_lgm"])
        .select("id");
      removedCampaignContacts = removed?.length || 0;

      // Delete the rejected state_leads
      await sb.from("state_leads").delete().in("id", ids);
    }

    // Log
    await sb.from("upload_logs").insert({
      file_name: `lgm_clean_existing_${stateFilter || "all"}`,
      state: stateFilter || "ALL",
      total_rows: checked,
      inserted_count: kept,
      duplicate_count: rejected.length,
    }).catch(() => {});

    return new Response(JSON.stringify({
      success: true,
      checked,
      kept,
      rejected: rejected.length,
      enriched: enriched.length,
      campaign_contacts_removed: removedCampaignContacts,
      rejected_details: rejected.slice(0, 100),
      next_offset: (leads?.length || 0) === limit ? offset + limit : null,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

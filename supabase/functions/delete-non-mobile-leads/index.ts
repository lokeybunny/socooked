// Move non-mobile / invalid leads from state_leads -> rejected_leads, then delete.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const body = await req.json().catch(() => ({}));
    const dryRun = body.dry_run === true;
    if (!dryRun && body.confirm !== true) {
      return new Response(JSON.stringify({ error: "confirm required (set confirm:true)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find offending leads in batches
    const PAGE = 500;
    let movedTotal = 0;
    while (true) {
      const { data: leads, error } = await supabase
        .from("state_leads")
        .select("*")
        .or("phone_line_type.neq.mobile,phone_valid.eq.false")
        .limit(PAGE);
      if (error) throw error;
      if (!leads?.length) break;

      if (!dryRun) {
        const rej = leads.map((l: any) => ({
          state: l.state,
          phone_raw: l.phone_number,
          phone_normalized: l.phone_e164,
          phone_valid: l.phone_valid,
          phone_line_type: l.phone_line_type,
          phone_carrier: l.phone_carrier,
          phone_lookup_status: l.phone_lookup_status,
          phone_lookup_checked_at: l.phone_lookup_checked_at,
          rejection_reason: l.phone_line_type && l.phone_line_type !== "mobile"
            ? l.phone_line_type
            : (l.phone_valid === false ? "invalid" : "non_mobile"),
          import_batch_id: l.import_batch_id,
          uploaded_file_name: l.uploaded_file_name,
          original_row: l, source: "audit_cleanup",
        }));
        const { error: insErr } = await supabase.from("rejected_leads").insert(rej);
        if (insErr) throw insErr;
        const ids = leads.map((l: any) => l.id);
        const { error: delErr } = await supabase.from("state_leads").delete().in("id", ids);
        if (delErr) throw delErr;
      }
      movedTotal += leads.length;
      if (leads.length < PAGE) break;
    }

    return new Response(JSON.stringify({ moved: movedTotal, dry_run: dryRun }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

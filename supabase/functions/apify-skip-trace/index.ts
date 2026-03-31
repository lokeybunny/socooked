import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json().catch(() => ({}));
    const { action, lead_id, address, apify_run_id } = body;

    // ── ACTION: poll ── check if a previously-started run has results
    if (action === "poll") {
      if (!apify_run_id || !lead_id) return json({ error: "apify_run_id and lead_id required" }, 400);

      const { data: apifyConfig } = await supabase
        .from("apify_config")
        .select("api_key")
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      const APIFY_TOKEN = apifyConfig?.api_key || Deno.env.get("APIFY_TOKEN");
      if (!APIFY_TOKEN) return json({ error: "No Apify token" }, 500);

      const statusResp = await fetch(
        `https://api.apify.com/v2/actor-runs/${apify_run_id}?token=${APIFY_TOKEN}`
      );
      if (!statusResp.ok) {
        const t = await statusResp.text();
        return json({ error: `Apify status check failed: ${statusResp.status}`, detail: t }, 502);
      }

      const statusData = await statusResp.json();
      const runStatus = statusData.data?.status;

      if (runStatus === "RUNNING" || runStatus === "READY") {
        return json({ status: "running" });
      }

      if (runStatus === "FAILED" || runStatus === "ABORTED" || runStatus === "TIMED-OUT") {
        // Update lead meta to clear pending state
        const { data: lead } = await supabase.from("lw_landing_leads").select("meta").eq("id", lead_id).maybeSingle();
        const meta = (lead?.meta as Record<string, any>) || {};
        delete meta.skip_trace_pending;
        delete meta.skip_trace_apify_run_id;
        meta.skip_trace_error = `Apify run ${runStatus}`;
        await supabase.from("lw_landing_leads").update({ meta: meta as any }).eq("id", lead_id);
        return json({ status: "failed", error: `Apify run ${runStatus}` });
      }

      // SUCCEEDED — fetch dataset
      const datasetId = statusData.data?.defaultDatasetId;
      if (!datasetId) return json({ status: "failed", error: "No dataset" });

      const itemsResp = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}`);
      if (!itemsResp.ok) {
        await itemsResp.text();
        return json({ status: "failed", error: "Dataset fetch failed" });
      }

      const items = await itemsResp.json();
      if (!items || items.length === 0) {
        const { data: lead } = await supabase.from("lw_landing_leads").select("meta").eq("id", lead_id).maybeSingle();
        const meta = (lead?.meta as Record<string, any>) || {};
        delete meta.skip_trace_pending;
        delete meta.skip_trace_apify_run_id;
        meta.skip_trace_error = "No data returned";
        await supabase.from("lw_landing_leads").update({ meta: meta as any }).eq("id", lead_id);
        return json({ status: "completed", phones: [], emails: [], error: "No data returned" });
      }

      const result = items[0];
      const { phones, emails, ownerName, mailingStr } = parseResult(result);

      // Update lead meta
      const { data: lead } = await supabase.from("lw_landing_leads").select("meta").eq("id", lead_id).maybeSingle();
      const existingMeta = (lead?.meta as Record<string, any>) || {};
      const updatedMeta = {
        ...existingMeta,
        skip_traced: true,
        skip_trace_pending: false,
        skip_trace_source: "apify_one-api/skip-trace",
        skip_trace_phones: phones,
        skip_trace_emails: emails,
        skip_trace_owner_name: ownerName,
        skip_trace_mailing: mailingStr,
        skip_trace_raw: result,
        owner_phone: phones[0] || null,
        owner_email: emails[0] || null,
      };
      delete updatedMeta.skip_trace_apify_run_id;
      delete updatedMeta.skip_trace_error;

      await supabase.from("lw_landing_leads").update({ meta: updatedMeta as any }).eq("id", lead_id);

      // Log
      await supabase.from("lw_ingestion_runs").insert({
        run_type: "apify_skip_trace",
        source: "apify",
        records_fetched: 1,
        records_new: phones.length > 0 ? 1 : 0,
        credits_used: 0,
        params: { lead_id, apify_run_id },
        status: "completed",
      });

      return json({
        status: "completed",
        phone: phones[0] || null,
        phones,
        email: emails[0] || null,
        emails,
        owner_name: ownerName,
        mailing_address: mailingStr,
      });
    }

    // ── ACTION: start (default) ── kick off the Apify run and return immediately
    if (!lead_id || !address) return json({ error: "lead_id and address are required" }, 400);

    const { data: apifyConfig } = await supabase
      .from("apify_config")
      .select("api_key")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    const APIFY_TOKEN = apifyConfig?.api_key || Deno.env.get("APIFY_TOKEN");
    if (!APIFY_TOKEN) return json({ error: "No active Apify API key configured" }, 500);

    // Check blocked
    const { data: blocked } = await supabase
      .from("apify_blocked_workers")
      .select("id")
      .eq("actor_shortcode", "one-api/skip-trace")
      .maybeSingle();
    if (blocked) return json({ error: "one-api/skip-trace is blocked" }, 403);

    // Start Apify run
    const actorId = "one-api~skip-trace";
    const runResp = await fetch(`https://api.apify.com/v2/acts/${actorId}/runs?token=${APIFY_TOKEN}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address }),
    });

    if (!runResp.ok) {
      const errText = await runResp.text();
      console.error(`Apify run start failed: ${runResp.status} — ${errText}`);
      if (runResp.status === 402 || runResp.status === 403) {
        return json({ error: "Apify billing issue" }, 402);
      }
      return json({ error: `Apify error: ${runResp.status}` }, 502);
    }

    const runData = await runResp.json();
    const runId = runData.data?.id;
    if (!runId) return json({ error: "Failed to get run ID" }, 502);

    // Mark the lead as pending
    const { data: lead } = await supabase.from("lw_landing_leads").select("meta").eq("id", lead_id).maybeSingle();
    const meta = (lead?.meta as Record<string, any>) || {};
    meta.skip_trace_pending = true;
    meta.skip_trace_apify_run_id = runId;
    delete meta.skip_trace_error;
    await supabase.from("lw_landing_leads").update({ meta: meta as any }).eq("id", lead_id);

    return json({ ok: true, status: "started", apify_run_id: runId });
  } catch (err) {
    console.error("apify-skip-trace error:", err);
    return json({ error: err.message }, 500);
  }
});

function parseResult(result: any) {
  const phones: string[] = [];
  const emails: string[] = [];

  const addPhones = (arr: any[]) => {
    for (const p of arr) {
      const num = typeof p === "string" ? p : p?.number || p?.phone || p?.phoneNumber;
      if (num && !phones.includes(num)) phones.push(num);
    }
  };
  const addEmails = (arr: any[]) => {
    for (const e of arr) {
      const addr = typeof e === "string" ? e : e?.address || e?.email;
      if (addr && !emails.includes(addr)) emails.push(addr);
    }
  };

  if (Array.isArray(result.phones)) addPhones(result.phones);
  if (result.phone) phones.push(String(result.phone));
  if (Array.isArray(result.phoneNumbers)) addPhones(result.phoneNumbers);
  if (Array.isArray(result.emails)) addEmails(result.emails);
  if (result.email) emails.push(String(result.email));
  if (Array.isArray(result.emailAddresses)) addEmails(result.emailAddresses);

  const ownerName = result.name || result.ownerName || result.owner || null;
  const mailingAddress = result.mailingAddress || result.currentAddress || null;
  const mailingStr = mailingAddress
    ? typeof mailingAddress === "string"
      ? mailingAddress
      : [mailingAddress.street, mailingAddress.city, mailingAddress.state, mailingAddress.zip].filter(Boolean).join(", ")
    : null;

  return { phones, emails, ownerName, mailingStr };
}

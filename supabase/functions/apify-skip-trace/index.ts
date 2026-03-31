import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get active Apify token from apify_config table
    const { data: apifyConfig } = await supabase
      .from("apify_config")
      .select("api_key")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    const APIFY_TOKEN = apifyConfig?.api_key || Deno.env.get("APIFY_TOKEN");
    if (!APIFY_TOKEN)
      return new Response(
        JSON.stringify({ error: "No active Apify API key configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    // Check if this actor is blocked
    const { data: blocked } = await supabase
      .from("apify_blocked_workers")
      .select("id")
      .eq("actor_shortcode", "one-api/skip-trace")
      .maybeSingle();

    if (blocked) {
      return new Response(
        JSON.stringify({ error: "The skip-trace worker (one-api/skip-trace) is currently blocked" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { lead_id, address } = body;

    if (!lead_id || !address) {
      return new Response(
        JSON.stringify({ error: "lead_id and address are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use tilde instead of slash for Apify actor path
    const actorId = "one-api~skip-trace";
    const runUrl = `https://api.apify.com/v2/acts/${actorId}/runs?token=${APIFY_TOKEN}`;

    // Start the Apify actor with the address
    const runResp = await fetch(runUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: address,
      }),
    });

    if (!runResp.ok) {
      const errText = await runResp.text();
      console.error(`Apify run start failed: ${runResp.status} — ${errText}`);

      if (runResp.status === 402 || runResp.status === 403) {
        return new Response(
          JSON.stringify({ error: "Apify billing issue — cannot run skip trace" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: `Apify error: ${runResp.status}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const runData = await runResp.json();
    const runId = runData.data?.id;

    if (!runId) {
      return new Response(
        JSON.stringify({ error: "Failed to get run ID from Apify" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Poll for completion (max 60 seconds)
    let result: any = null;
    const maxWait = 60_000;
    const pollInterval = 3_000;
    const start = Date.now();

    while (Date.now() - start < maxWait) {
      await new Promise((r) => setTimeout(r, pollInterval));

      const statusResp = await fetch(
        `https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`
      );
      if (!statusResp.ok) continue;

      const statusData = await statusResp.json();
      const status = statusData.data?.status;

      if (status === "SUCCEEDED" || status === "RUNNING") {
        // Try to get dataset items
        const datasetId = statusData.data?.defaultDatasetId;
        if (datasetId) {
          const itemsResp = await fetch(
            `https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}`
          );
          if (itemsResp.ok) {
            const items = await itemsResp.json();
            if (items && items.length > 0) {
              result = items[0]; // Take first result
              if (status === "SUCCEEDED") break;
            }
          }
        }
        if (status === "SUCCEEDED") break;
      } else if (status === "FAILED" || status === "ABORTED" || status === "TIMED-OUT") {
        return new Response(
          JSON.stringify({ error: `Apify run ${status}` }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (!result) {
      return new Response(
        JSON.stringify({ error: "Skip trace timed out or returned no data" }),
        { status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse the result — adapt to typical skip trace output format
    const phones: string[] = [];
    const emails: string[] = [];

    // Handle various output formats from skip trace actors
    if (result.phones && Array.isArray(result.phones)) {
      result.phones.forEach((p: any) => {
        const num = typeof p === "string" ? p : p?.number || p?.phone || p?.phoneNumber;
        if (num && !phones.includes(num)) phones.push(num);
      });
    }
    if (result.phone) phones.push(String(result.phone));
    if (result.phoneNumbers && Array.isArray(result.phoneNumbers)) {
      result.phoneNumbers.forEach((p: any) => {
        const num = typeof p === "string" ? p : p?.number || p?.phone;
        if (num && !phones.includes(num)) phones.push(num);
      });
    }

    if (result.emails && Array.isArray(result.emails)) {
      result.emails.forEach((e: any) => {
        const addr = typeof e === "string" ? e : e?.address || e?.email;
        if (addr && !emails.includes(addr)) emails.push(addr);
      });
    }
    if (result.email) emails.push(String(result.email));
    if (result.emailAddresses && Array.isArray(result.emailAddresses)) {
      result.emailAddresses.forEach((e: any) => {
        const addr = typeof e === "string" ? e : e?.address || e?.email;
        if (addr && !emails.includes(addr)) emails.push(addr);
      });
    }

    // Extract owner name if available
    const ownerName = result.name || result.ownerName || result.owner || null;
    const mailingAddress = result.mailingAddress || result.currentAddress || null;
    const mailingStr = mailingAddress
      ? typeof mailingAddress === "string"
        ? mailingAddress
        : [mailingAddress.street, mailingAddress.city, mailingAddress.state, mailingAddress.zip]
            .filter(Boolean)
            .join(", ")
      : null;

    // Update the lead meta with skip trace results
    const { data: lead } = await supabase
      .from("lw_landing_leads")
      .select("meta")
      .eq("id", lead_id)
      .maybeSingle();

    const existingMeta = (lead?.meta as Record<string, any>) || {};
    const updatedMeta = {
      ...existingMeta,
      skip_traced: true,
      skip_trace_source: "apify_one-api/skip-trace",
      skip_trace_phones: phones,
      skip_trace_emails: emails,
      skip_trace_owner_name: ownerName,
      skip_trace_mailing: mailingStr,
      skip_trace_raw: result,
      owner_phone: phones[0] || null,
      owner_email: emails[0] || null,
    };

    await supabase
      .from("lw_landing_leads")
      .update({ meta: updatedMeta as any })
      .eq("id", lead_id);

    // Log the run
    await supabase.from("lw_ingestion_runs").insert({
      run_type: "apify_skip_trace",
      source: "apify",
      records_fetched: 1,
      records_new: phones.length > 0 ? 1 : 0,
      credits_used: 0,
      params: { lead_id, address, apify_run_id: runId },
      status: "completed",
    });

    return new Response(
      JSON.stringify({
        ok: true,
        phone: phones[0] || null,
        phones,
        email: emails[0] || null,
        emails,
        owner_name: ownerName,
        mailing_address: mailingStr,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("apify-skip-trace error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

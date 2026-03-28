import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const REAPI_BASE = "https://api.realestateapi.com/v2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const REAPI_KEY = Deno.env.get("REAPI_API_KEY");
    if (!REAPI_KEY)
      return new Response(
        JSON.stringify({ error: "REAPI_API_KEY not configured" }),
        { status: 500, headers: corsHeaders }
      );

    // Budget check
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const { data: runs } = await supabase
      .from("lw_ingestion_runs")
      .select("credits_used")
      .gte("created_at", monthStart.toISOString());
    const monthlySpend = (runs || []).reduce(
      (sum: number, r: any) => sum + (r.credits_used || 0),
      0
    );
    if (monthlySpend >= 500) {
      return new Response(
        JSON.stringify({ skipped: true, reason: "Monthly budget reached" }),
        { headers: corsHeaders }
      );
    }

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const minScore = body.min_motivation_score || 60;
    const limit = Math.min(body.limit || 25, 50);

    // Get high-motivation sellers not yet skip traced
    const { data: sellers } = await supabase
      .from("lw_sellers")
      .select("*")
      .gte("motivation_score", minScore)
      .is("skip_traced_at", null)
      .neq("status", "dead")
      .order("motivation_score", { ascending: false })
      .limit(limit);

    if (!sellers || sellers.length === 0) {
      return new Response(
        JSON.stringify({ message: "No sellers qualify for skip tracing", traced: 0 }),
        { headers: corsHeaders }
      );
    }

    let traced = 0;
    let creditsUsed = 0;

    for (const seller of sellers) {
      try {
        const skipBody: any = {};

        // Build address object from seller data
        if (seller.address_full) {
          skipBody.address = seller.address_full;
        }
        if (seller.owner_name) {
          skipBody.name = seller.owner_name;
        }
        // Also try structured address
        if (seller.city && seller.state) {
          skipBody.city = seller.city;
          skipBody.state = seller.state;
          skipBody.zip = seller.zip;
        }

        const resp = await fetch(`${REAPI_BASE}/SkipTrace`, {
          method: "POST",
          headers: {
            "x-api-key": REAPI_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(skipBody),
        });

        if (!resp.ok) {
          console.error(`Skip trace failed for seller ${seller.id}: ${resp.status}`);
          continue;
        }

        const data = await resp.json();
        const result = data.data || data.output || data;
        creditsUsed += 0.15; // ~$0.15 per skip trace

        // Extract phone and email from result
        const phones =
          result.phoneNumbers ||
          result.phones ||
          result.phone ||
          [];
        const emails =
          result.emailAddresses ||
          result.emails ||
          result.email ||
          [];

        const bestPhone = Array.isArray(phones)
          ? phones[0]?.number || phones[0]?.phone || phones[0] || null
          : phones || null;
        const bestEmail = Array.isArray(emails)
          ? emails[0]?.address || emails[0]?.email || emails[0] || null
          : emails || null;

        const mailingAddr =
          result.mailingAddress ||
          result.currentAddress ||
          null;
        const mailingStr = mailingAddr
          ? typeof mailingAddr === "string"
            ? mailingAddr
            : [mailingAddr.street, mailingAddr.city, mailingAddr.state, mailingAddr.zip]
                .filter(Boolean)
                .join(", ")
          : null;

        await supabase
          .from("lw_sellers")
          .update({
            owner_phone: bestPhone,
            owner_email: bestEmail,
            owner_mailing_address: mailingStr || seller.owner_mailing_address,
            skip_traced_at: new Date().toISOString(),
            status: bestPhone ? "skip_traced" : seller.status,
            meta: { ...seller.meta, skip_trace_result: result },
          })
          .eq("id", seller.id);

        traced++;
      } catch (e) {
        console.error(`Skip trace error for ${seller.id}:`, e);
      }
    }

    // Log run
    await supabase.from("lw_ingestion_runs").insert({
      run_type: "reapi_skip_trace",
      source: "reapi",
      records_fetched: sellers.length,
      records_new: traced,
      credits_used: creditsUsed,
      params: { min_score: minScore, limit },
      status: "completed",
    });

    return new Response(
      JSON.stringify({ ok: true, candidates: sellers.length, traced, credits_used: creditsUsed }),
      { headers: corsHeaders }
    );
  } catch (err) {
    console.error("land-reapi-skip-trace error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: corsHeaders }
    );
  }
});

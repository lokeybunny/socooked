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

    const body = await req.json().catch(() => ({}));
    const sellerId = body.seller_id;
    if (!sellerId) {
      return new Response(
        JSON.stringify({ error: "seller_id is required" }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Get the seller
    const { data: seller, error: sellerErr } = await supabase
      .from("lw_sellers")
      .select("*")
      .eq("id", sellerId)
      .maybeSingle();

    if (sellerErr || !seller) {
      return new Response(
        JSON.stringify({ error: "Seller not found" }),
        { status: 404, headers: corsHeaders }
      );
    }

    // Build skip trace request
    const skipBody: any = {};
    if (seller.address_full) skipBody.address = seller.address_full;
    if (seller.owner_name) skipBody.name = seller.owner_name;
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
      const errText = await resp.text();
      console.error(`Skip trace failed: ${resp.status} — ${errText}`);
      return new Response(
        JSON.stringify({ error: `REAPI error: ${resp.status}` }),
        { status: 502, headers: corsHeaders }
      );
    }

    const data = await resp.json();
    const result = data.data || data.output || data;

    // Extract phone and email
    const phones = result.phoneNumbers || result.phones || result.phone || [];
    const emails = result.emailAddresses || result.emails || result.email || [];

    const bestPhone = Array.isArray(phones)
      ? phones[0]?.number || phones[0]?.phone || phones[0] || null
      : phones || null;
    const bestEmail = Array.isArray(emails)
      ? emails[0]?.address || emails[0]?.email || emails[0] || null
      : emails || null;

    const mailingAddr = result.mailingAddress || result.currentAddress || null;
    const mailingStr = mailingAddr
      ? typeof mailingAddr === "string"
        ? mailingAddr
        : [mailingAddr.street, mailingAddr.city, mailingAddr.state, mailingAddr.zip]
            .filter(Boolean)
            .join(", ")
      : null;

    // Update seller
    const updateData: any = {
      skip_traced_at: new Date().toISOString(),
      status: bestPhone ? "skip_traced" : seller.status,
      meta: { ...seller.meta, skip_trace_result: result },
    };
    if (bestPhone) updateData.owner_phone = bestPhone;
    if (bestEmail) updateData.owner_email = bestEmail;
    if (mailingStr) updateData.owner_mailing_address = mailingStr;

    await supabase
      .from("lw_sellers")
      .update(updateData)
      .eq("id", sellerId);

    // Log ingestion run
    await supabase.from("lw_ingestion_runs").insert({
      run_type: "reapi_skip_trace_single",
      source: "reapi",
      records_fetched: 1,
      records_new: bestPhone ? 1 : 0,
      credits_used: 0.15,
      params: { seller_id: sellerId },
      status: "completed",
    });

    return new Response(
      JSON.stringify({
        ok: true,
        phone: bestPhone,
        email: bestEmail,
        mailing_address: mailingStr,
      }),
      { headers: corsHeaders }
    );
  } catch (err) {
    console.error("land-reapi-skip-trace-single error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: corsHeaders }
    );
  }
});

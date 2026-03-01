import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** Retry helper */
async function withRetry<T>(fn: () => Promise<T>, label: string, maxRetries = 3): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      console.log(`${label} attempt ${attempt}/${maxRetries} failed: ${err.message}`);
      if (attempt === maxRetries) throw err;
      const delay = Math.min(2000 * Math.pow(2, attempt - 1), 15000);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error(`${label} exhausted all retries`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const {
      contact_job_title = [],
      contact_location = [],
      contact_city = [],
      company_industry = [],
      company_keywords = [],
      seniority_level = [],
      fetch_count = 25,
      email_status = ["validated"],
    } = body;

    const apifyToken = Deno.env.get("APIFY_TOKEN");
    if (!apifyToken) throw new Error("APIFY_TOKEN not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // Build Apify input
    const input: Record<string, any> = {
      fetch_count: Math.min(fetch_count, 100), // cap per run
      email_status,
    };
    if (contact_job_title.length) input.contact_job_title = contact_job_title;
    if (contact_location.length) input.contact_location = contact_location;
    if (contact_city.length) input.contact_city = contact_city;
    if (company_industry.length) input.company_industry = company_industry;
    if (company_keywords.length) input.company_keywords = company_keywords;
    if (seniority_level.length) input.seniority_level = seniority_level;

    console.log(`Lead Finder: starting with input`, JSON.stringify(input));

    const actorId = "code_crafter~leads-finder";
    const runUrl = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${apifyToken}`;

    const results = await withRetry(async () => {
      const res = await fetch(runUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(180_000),
      });
      if (!res.ok) {
        const err = await res.text().catch(() => "");
        throw new Error(`Apify request failed (${res.status}): ${err.slice(0, 300)}`);
      }
      return res.json();
    }, "LeadsFinder");

    if (!Array.isArray(results) || results.length === 0) {
      return new Response(JSON.stringify({ leads: [], message: "No leads found for these criteria" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Lead Finder: got ${results.length} results from Apify`);

    // Auto-create customers from leads
    const created: any[] = [];
    for (const lead of results) {
      const fullName = lead.full_name || `${lead.first_name || ''} ${lead.last_name || ''}`.trim();
      if (!fullName) continue;

      // Check if customer already exists by email
      if (lead.email) {
        const { data: existing } = await sb
          .from("customers")
          .select("id")
          .eq("email", lead.email)
          .limit(1);
        if (existing && existing.length > 0) {
          console.log(`Skipping duplicate: ${lead.email}`);
          continue;
        }
      }

      const customerPayload = {
        full_name: fullName,
        email: lead.email || null,
        phone: lead.mobile_number || lead.company_phone || null,
        company: lead.company_name || null,
        status: "lead",
        source: "lead-finder",
        category: "potential",
        address: [lead.city, lead.state, lead.country].filter(Boolean).join(", ") || null,
        notes: [
          lead.job_title && `Title: ${lead.job_title}`,
          lead.headline && `Headline: ${lead.headline}`,
          lead.industry && `Industry: ${lead.industry}`,
          lead.company_description && `Company: ${lead.company_description}`,
        ].filter(Boolean).join("\n") || null,
        meta: {
          linkedin: lead.linkedin || null,
          company_domain: lead.company_domain || null,
          company_website: lead.company_website || null,
          company_linkedin: lead.company_linkedin || null,
          company_size: lead.company_size || null,
          company_revenue: lead.company_annual_revenue || null,
          company_funding: lead.company_total_funding || null,
          company_founded_year: lead.company_founded_year || null,
          job_title: lead.job_title || null,
          seniority_level: lead.seniority_level || null,
          functional_level: lead.functional_level || null,
          personal_email: lead.personal_email || null,
          company_full_address: lead.company_full_address || null,
          keywords: lead.keywords || null,
          technologies: lead.company_technologies || null,
          source_platform: "lead-finder",
        },
      };

      const { data: inserted, error } = await sb
        .from("customers")
        .insert(customerPayload)
        .select("id, full_name, email, company")
        .single();

      if (error) {
        console.log(`Failed to create customer ${fullName}: ${error.message}`);
      } else {
        created.push({ ...inserted, ...lead });
      }
    }

    console.log(`Lead Finder: created ${created.length} new customers`);

    return new Response(
      JSON.stringify({
        leads: results,
        created_count: created.length,
        total_found: results.length,
        created_customers: created,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Lead Finder error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

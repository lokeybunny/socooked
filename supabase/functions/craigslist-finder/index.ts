import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function withRetry<T>(fn: () => Promise<T>, label: string, maxRetries = 3): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      console.log(`${label} attempt ${attempt}/${maxRetries} failed: ${err.message}`);
      const shouldNotRetry = err?.noRetry === true || err?.status === 402;
      if (attempt === maxRetries || shouldNotRetry) throw err;
      const delay = Math.min(2000 * Math.pow(2, attempt - 1), 15000);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error(`${label} exhausted all retries`);
}

/** Extract email from text */
function extractEmail(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return match ? match[0].toLowerCase() : null;
}

/** Extract website URLs from text (non-craigslist) */
function extractWebsite(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = text.match(/https?:\/\/(?!.*craigslist\.org)[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}[^\s)"]*/i);
  return match ? match[0] : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { search_url = "" } = body;

    if (!search_url || !search_url.includes("craigslist.org")) {
      return new Response(
        JSON.stringify({ error: "A valid Craigslist search URL is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apifyToken = Deno.env.get("APIFY_TOKEN_CRAIGSLIST");
    if (!apifyToken) throw new Error("APIFY_TOKEN_CRAIGSLIST not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // ivanvs/craigslist-scraper input format
    const input = {
      maxConcurrency: 1,
      proxyConfiguration: { useApifyProxy: true },
      urls: [{ url: search_url }],
    };

    console.log(`Craigslist Finder (ivanvs): starting with URL: ${search_url}`);

    const actorId = "ivanvs~craigslist-scraper";
    const runUrl = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${apifyToken}`;

    const results = await withRetry(async () => {
      const res = await fetch(runUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(300_000),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        if (res.status === 402) {
          const quotaError: any = new Error(`Apify usage limit reached`);
          quotaError.status = 402;
          quotaError.noRetry = true;
          throw quotaError;
        }
        throw new Error(`Apify request failed (${res.status}): ${errText.slice(0, 300)}`);
      }
      return res.json();
    }, "CraigslistFinder");

    if (!Array.isArray(results) || results.length === 0) {
      return new Response(
        JSON.stringify({ posts: [], message: "No posts found for this search URL" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Craigslist Finder: got ${results.length} results from Apify`);

    const created: any[] = [];
    for (const post of results) {
      // ivanvs output fields: title, url, id, datetime, location, category, price, post, phoneNumbers[], pics[], notices[]
      const postTitle = post.title || "Craigslist Post";
      const postUrl = post.url || null;
      const postLocation = post.location || null;
      const postPrice = post.price || null;
      const postDate = post.datetime || null;
      const postBody = post.post || null; // ivanvs uses "post" field for body text

      // phoneNumbers is an array in ivanvs output
      const phoneNumbers: string[] = Array.isArray(post.phoneNumbers) ? post.phoneNumbers : [];
      const phone = phoneNumbers.length > 0 ? phoneNumbers[0] : null;

      // Extract email and website from post body
      const email = extractEmail(postBody);
      const website = extractWebsite(postBody);
      const hasWebsite = !!website;

      // Skip posts without phone numbers (requirement: phone is mandatory)
      if (!phone) {
        console.log(`Skipping post without phone: ${postTitle.slice(0, 60)}`);
        continue;
      }

      // Deduplicate by source_url
      if (postUrl) {
        const { data: existingFinding } = await sb
          .from("research_findings")
          .select("id")
          .eq("finding_type", "lead")
          .eq("source_url", postUrl)
          .limit(1);
        if (existingFinding && existingFinding.length > 0) {
          console.log(`Skipping duplicate: ${postUrl}`);
          continue;
        }
      }

      // Create customer
      const customerPayload = {
        full_name: postTitle.slice(0, 120),
        email: email || null,
        phone,
        company: null,
        status: "lead",
        source: "craigslist",
        category: "craigslist",
        address: postLocation || null,
        notes: [
          postPrice && `Price: ${postPrice}`,
          postLocation && `Location: ${postLocation}`,
          postDate && `Posted: ${postDate}`,
          phone && `Phone: ${phone}`,
          phoneNumbers.length > 1 && `Alt phones: ${phoneNumbers.slice(1).join(', ')}`,
          email && `Email: ${email}`,
          website && `Website: ${website}`,
          postBody && postBody.slice(0, 300),
        ].filter(Boolean).join("\n") || null,
        meta: {
          craigslist_url: postUrl,
          craigslist_id: post.id || null,
          price: postPrice,
          post_date: postDate,
          location: postLocation,
          phone,
          phone_numbers: phoneNumbers,
          email,
          website,
          has_website: hasWebsite,
          category: post.category || null,
          pics: Array.isArray(post.pics) ? post.pics.slice(0, 5) : [],
          source_platform: "craigslist-finder",
          actor: "ivanvs/craigslist-scraper",
        },
      };

      const { data: inserted, error } = await sb
        .from("customers")
        .insert(customerPayload)
        .select("id, full_name, email, company")
        .single();

      if (error) {
        console.log(`Failed to create customer: ${error.message}`);
        continue;
      }

      created.push({ ...inserted, ...post, phone, email, website, has_website: hasWebsite });

      // Create research finding
      await sb.from("research_findings").insert({
        title: postTitle.slice(0, 200),
        summary: [
          postPrice,
          postLocation,
          phone && `📞 ${phone}`,
          email && `✉️ ${email}`,
          website && `🌐 ${website}`,
          postBody?.slice(0, 200),
        ].filter(Boolean).join(" · "),
        source_url: postUrl,
        finding_type: "lead",
        category: "craigslist",
        status: "new",
        created_by: "craigslist-finder",
        customer_id: inserted.id,
        raw_data: {
          type: "craigslist_post",
          name: postTitle,
          symbol: "CL",
          deploy_window: "OUTREACH",
          craigslist_id: post.id,
          price: postPrice,
          location: postLocation,
          post_date: postDate,
          body: postBody?.slice(0, 500),
          url: postUrl,
          phone,
          phone_numbers: phoneNumbers,
          email,
          website,
          has_website: hasWebsite,
          pics: Array.isArray(post.pics) ? post.pics.slice(0, 5) : [],
          source_platform: "craigslist-finder",
          actor: "ivanvs/craigslist-scraper",
        },
        tags: ["craigslist-finder", postLocation].filter(Boolean),
      });
    }

    console.log(`Craigslist Finder: created ${created.length} new customers from ${results.length} posts`);

    return new Response(
      JSON.stringify({
        posts: results,
        total_found: results.length,
        created_count: created.length,
        created_customers: created,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Craigslist Finder error:", err);

    if (err?.status === 402) {
      return new Response(
        JSON.stringify({
          posts: [],
          created_count: 0,
          total_found: 0,
          warning: "Craigslist scraper usage limit reached. Please top up credits and retry.",
          error_code: "APIFY_USAGE_LIMIT",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

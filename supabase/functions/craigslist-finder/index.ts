import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function extractEmail(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return match ? match[0].toLowerCase() : null;
}

function extractWebsite(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = text.match(/https?:\/\/(?!.*craigslist\.org)[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}[^\s)"]*/i);
  return match ? match[0] : null;
}

function normalizePhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  const normalized = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return normalized.length === 10 ? normalized : null;
}

function extractPhones(...values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const matches: string[] = [];
  const phoneRegex = /(?:\+?1[\s:.-]*)?(?:\(?\d{3}\)?[\s:.-]*)\d{3}[\s:.-]*\d{4}/g;

  for (const value of values) {
    if (!value) continue;
    for (const raw of value.match(phoneRegex) || []) {
      const normalized = normalizePhone(raw);
      if (normalized && !seen.has(normalized)) {
        seen.add(normalized);
        matches.push(normalized);
      }
    }
  }

  return matches;
}

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

async function syncCraigslistResults({
  results,
  sb,
  send,
  emitPosts = false,
}: {
  results: any[];
  sb: ReturnType<typeof createClient>;
  send?: (event: string, data: unknown) => void;
  emitPosts?: boolean;
}) {
  if (!Array.isArray(results) || results.length === 0) {
    return { totalFound: 0, createdCount: 0 };
  }

  let createdCount = 0;

  for (let idx = 0; idx < results.length; idx++) {
    const post = results[idx];
    const postTitle = post.title || "Craigslist Post";
    const postUrl = post.url || null;
    const postLocation = post.location || null;
    const postPrice = post.price || null;
    const postDate = post.datetime || null;
    const postBody = post.post || null;
    const actorPhoneNumbers = Array.isArray(post.phoneNumbers) ? post.phoneNumbers : [];
    const phoneNumbers = extractPhones(
      actorPhoneNumbers.join(" "),
      postTitle,
      postBody,
    );
    const phone = phoneNumbers[0] || null;
    const email = extractEmail(postBody);
    const website = extractWebsite(postBody);
    const hasWebsite = !!website;

    if (emitPosts && send) {
      send("post", {
        index: idx,
        total: results.length,
        post: { ...post, phone, email, website, has_website: hasWebsite },
      });
    }

    if (!phone) continue;

    if (postUrl) {
      const { data: existing } = await sb
        .from("research_findings")
        .select("id")
        .eq("finding_type", "lead")
        .eq("source_url", postUrl)
        .limit(1);
      if (existing && existing.length > 0) continue;
    }

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
        phoneNumbers.length > 1 && `Alt phones: ${phoneNumbers.slice(1).join(", ")}`,
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

    createdCount++;

    if (send) {
      send("lead_created", {
        index: idx,
        created_count: createdCount,
        customer: {
          ...inserted,
          phone,
          email,
          website,
          has_website: hasWebsite,
          location: postLocation,
          price: postPrice,
        },
        post,
      });
    }

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

  return { totalFound: results.length, createdCount };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const action = body.action || "start"; // "start" | "poll"

    const apifyToken = Deno.env.get("APIFY_TOKEN_CRAIGSLIST");
    if (!apifyToken) throw new Error("APIFY_TOKEN_CRAIGSLIST not configured");

    // ── ACTION: START ──
    if (action === "start") {
      const { search_url = "", keywords = "" } = body;
      if (!search_url || !search_url.includes("craigslist.org")) {
        return new Response(
          JSON.stringify({ error: "A valid Craigslist search URL is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let finalUrl = search_url;
      if (keywords && keywords.trim()) {
        const sep = search_url.includes("?") ? "&" : "?";
        finalUrl = `${search_url}${sep}query=${encodeURIComponent(keywords.trim())}`;
      }

      const input = {
        maxConcurrency: 1,
        proxyConfiguration: { useApifyProxy: true },
        urls: [{ url: finalUrl }],
      };

      console.log(`CL-Finder: starting async run for ${finalUrl}`);

      const actorId = "ivanvs~craigslist-scraper";
      const startRes = await fetch(
        `https://api.apify.com/v2/acts/${actorId}/runs?token=${apifyToken}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        }
      );

      if (!startRes.ok) {
        const errText = await startRes.text().catch(() => "");
        if (startRes.status === 402) {
          return new Response(
            JSON.stringify({ error: "Apify usage limit reached. Please top up credits.", code: "APIFY_LIMIT" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        throw new Error(`Failed to start Apify run (${startRes.status}): ${errText.slice(0, 300)}`);
      }

      const startData = await startRes.json();
      const runId = startData?.data?.id;
      if (!runId) throw new Error("No run ID returned from Apify");

      console.log(`CL-Finder: run started, runId=${runId}`);
      return new Response(
        JSON.stringify({ runId, status: "RUNNING" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── ACTION: POLL ──
    if (action === "poll") {
      const { run_id } = body;
      if (!run_id) {
        return new Response(
          JSON.stringify({ error: "run_id is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check run status
      const statusRes = await fetch(`https://api.apify.com/v2/actor-runs/${run_id}?token=${apifyToken}`);
      if (!statusRes.ok) throw new Error(`Failed to poll run status: ${statusRes.status}`);
      const statusData = await statusRes.json();
      const runStatus = statusData?.data?.status;

      if (runStatus === "FAILED" || runStatus === "ABORTED" || runStatus === "TIMED-OUT") {
        return new Response(
          JSON.stringify({ status: runStatus, error: `Apify run ${runStatus}` }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (runStatus !== "SUCCEEDED") {
        return new Response(
          JSON.stringify({ status: runStatus || "RUNNING" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Run succeeded — fetch dataset and process results via SSE stream
      const datasetId = statusData.data.defaultDatasetId;
      const dataRes = await fetch(
        `https://api.apify.com/v2/datasets/${datasetId}/items?token=${apifyToken}&format=json`
      );
      if (!dataRes.ok) throw new Error(`Failed to fetch dataset: ${dataRes.status}`);
      const results = await dataRes.json();
      console.log(`CL-Finder: dataset ${datasetId} returned ${Array.isArray(results) ? results.length : 0} items`);

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const sb = createClient(supabaseUrl, supabaseKey);

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const send = (event: string, data: unknown) => {
            try { controller.enqueue(encoder.encode(sseEvent(event, data))); } catch {}
          };

          try {
            if (!Array.isArray(results) || results.length === 0) {
              send("complete", { total_found: 0, created_count: 0 });
              controller.close();
              return;
            }

            send("progress", { step: 0, label: "Processing", detail: `Got ${results.length} posts, processing leads...` });

            let createdCount = 0;

            for (let idx = 0; idx < results.length; idx++) {
              const post = results[idx];
              const postTitle = post.title || "Craigslist Post";
              const postUrl = post.url || null;
              const postLocation = post.location || null;
              const postPrice = post.price || null;
              const postDate = post.datetime || null;
              const postBody = post.post || null;

              const phoneNumbers: string[] = Array.isArray(post.phoneNumbers) ? post.phoneNumbers : [];
              const phone = phoneNumbers.length > 0 ? phoneNumbers[0] : null;
              const email = extractEmail(postBody);
              const website = extractWebsite(postBody);
              const hasWebsite = !!website;

              // Stream every post to client for live display
              send("post", {
                index: idx,
                total: results.length,
                post: { ...post, phone, email, website, has_website: hasWebsite },
              });

              // Save leads even without phone — email or URL is enough contact info
              if (!phone && !email && !website) continue;

              // Deduplicate by source_url
              if (postUrl) {
                const { data: existing } = await sb
                  .from("research_findings")
                  .select("id")
                  .eq("finding_type", "lead")
                  .eq("source_url", postUrl)
                  .limit(1);
                if (existing && existing.length > 0) continue;
              }

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
                  phoneNumbers.length > 1 && `Alt phones: ${phoneNumbers.slice(1).join(", ")}`,
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

              createdCount++;

              send("lead_created", {
                index: idx,
                created_count: createdCount,
                customer: {
                  ...inserted,
                  phone,
                  email,
                  website,
                  has_website: hasWebsite,
                  location: postLocation,
                  price: postPrice,
                },
                post,
              });

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

            console.log(`CL-Finder: done. ${createdCount} new leads from ${results.length} posts`);
            send("complete", { total_found: results.length, created_count: createdCount });
          } catch (err: any) {
            console.error("CL-Finder stream error:", err);
            send("error", { message: err.message || "Unknown error" });
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    }

    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("CL-Finder error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

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

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
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

    const input = {
      maxConcurrency: 1,
      proxyConfiguration: { useApifyProxy: true },
      urls: [{ url: search_url }],
    };

    // Use SSE streaming
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(sseEvent(event, data)));
        };

        try {
          send("progress", { step: 0, label: "Scraping", status: "running", detail: `Fetching posts from Craigslist...` });

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
            send("complete", { posts: [], total_found: 0, created_count: 0, created_customers: [] });
            controller.close();
            return;
          }

          send("progress", { step: 1, label: "Processing", status: "running", detail: `Got ${results.length} posts, processing leads...` });

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

            // Send each raw post to the client immediately for display
            send("post", { index: idx, total: results.length, post: { ...post, phone, email, website, has_website: hasWebsite } });

            if (!phone) continue;

            // Deduplicate
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

            createdCount++;

            // Send the created lead to the client immediately
            send("lead_created", {
              index: idx,
              created_count: createdCount,
              customer: { ...inserted, phone, email, website, has_website: hasWebsite, location: postLocation, price: postPrice },
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

          send("complete", { total_found: results.length, created_count: createdCount });
        } catch (err: any) {
          console.error("Craigslist Finder stream error:", err);
          const event = err?.status === 402 ? "warning" : "error";
          send(event, { message: err.message || "Unknown error" });
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
  } catch (err: any) {
    console.error("Craigslist Finder error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

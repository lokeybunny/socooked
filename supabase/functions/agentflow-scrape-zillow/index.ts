import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const APIFY_TOKENS = [
  Deno.env.get("APIFY_TOKEN"),
  Deno.env.get("APIFY_TOKEN_CRAIGSLIST"),
  Deno.env.get("APIFY_TOKEN_COMMUNITY"),
].filter((t): t is string => !!t);

const ACTOR_ID = "maxcopell~zillow-scraper"; // Apify actor format uses ~

function normKey(name: string, brokerage: string, city: string) {
  return `${(name || "").trim().toLowerCase()}|${(brokerage || "").trim().toLowerCase()}|${(city || "").trim().toLowerCase()}`;
}

function locationToZillowUrl(location: string): string {
  // "Portland, OR" -> https://www.zillow.com/portland-or/
  const slug = location.toLowerCase().replace(/,\s*/g, "-").replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  return `https://www.zillow.com/${slug}/`;
}

async function runApifyActor(searchUrls: string[], maxItems: number): Promise<{ items: any[]; tokenUsed: string | null; error?: string }> {
  const input = {
    searchUrls: searchUrls.map((url) => ({ url })),
    extractionMethod: "MAP_MARKERS",
    maxItems,
    proxy: { useApifyProxy: true },
  };

  let lastError = "no tokens available";
  for (const token of APIFY_TOKENS) {
    try {
      const url = `https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync-get-dataset-items?token=${token}&clean=true&format=json`;
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(540000), // 9 min, edge function caps at ~10
      });
      if (r.status === 401 || r.status === 402 || r.status === 403) {
        lastError = `token rejected: ${r.status}`;
        continue; // try next token
      }
      if (!r.ok) {
        lastError = `apify ${r.status}: ${(await r.text()).slice(0, 300)}`;
        continue;
      }
      const items = await r.json();
      return { items: Array.isArray(items) ? items : [], tokenUsed: token.slice(0, 8) + "..." };
    } catch (e: any) {
      lastError = e?.message || String(e);
      continue;
    }
  }
  return { items: [], tokenUsed: null, error: lastError };
}

function extractAgent(item: any): { name: string; brokerage: string; profile_url: string | null; zuid: string | null } {
  const attr = item.attributionInfo || item.listing_agent || {};
  const name = attr.agentName || attr.agent_name || item.agentName || item.contactRecipients?.[0]?.displayName || "";
  const brokerage = attr.brokerName || attr.broker_name || item.brokerName || "";
  const profileRaw = attr.agentProfileUrl || attr.agent_profile_url || item.agentProfileUrl;
  const profile_url = profileRaw
    ? (profileRaw.startsWith("http") ? profileRaw : `https://www.zillow.com${profileRaw}`)
    : null;
  const zuid = attr.agentZuid || attr.agent_zuid || item.agentZuid || null;
  return { name: String(name || "").trim(), brokerage: String(brokerage || "").trim(), profile_url, zuid };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  let jobId: string | null = null;
  let location = "";

  try {
    const body = await req.json().catch(() => ({}));
    location = String(body.location || "").trim();
    const maxItems = Math.min(Math.max(Number(body.max_items) || 200, 50), 500);

    if (!location) {
      return new Response(JSON.stringify({ ok: false, error: "location required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (APIFY_TOKENS.length === 0) {
      return new Response(JSON.stringify({ ok: false, error: "no APIFY_TOKEN configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: job } = await supabase.from("af_scrape_jobs").insert({
      status: "running", target_location: location, started_at: new Date().toISOString(),
    }).select("id").single();
    jobId = job?.id || null;

    const searchUrl = locationToZillowUrl(location);
    const { items, tokenUsed, error } = await runApifyActor([searchUrl], maxItems);

    if (error) {
      await supabase.from("af_scrape_jobs").update({
        status: "failed", error_log: error, completed_at: new Date().toISOString(),
      }).eq("id", jobId);
      return new Response(JSON.stringify({ ok: false, error, location }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let newListings = 0;
    let newAgents = 0;
    const seenAgentKeys = new Set<string>();

    for (const item of items) {
      const zpid = String(item.zpid || item.id || "");
      if (!zpid) continue;

      // Listing upsert
      const listingRow = {
        zpid,
        address: item.address || item.streetAddress || null,
        city: item.city || item.addressCity || null,
        state: item.state || item.addressState || null,
        zip: item.zipcode || item.addressZipcode || null,
        price: typeof item.price === "number" ? item.price : (item.unformattedPrice ?? null),
        listing_url: item.detailUrl
          ? (item.detailUrl.startsWith("http") ? item.detailUrl : `https://www.zillow.com${item.detailUrl}`)
          : (item.url || null),
        scraped_at: new Date().toISOString(),
      };

      const { data: listing, error: lErr } = await supabase
        .from("af_listings")
        .upsert(listingRow, { onConflict: "zpid" })
        .select("id")
        .single();
      if (lErr || !listing) continue;
      newListings++;

      // Agent extraction
      const a = extractAgent(item);
      if (!a.name) continue; // broker-only listing, skip
      const key = normKey(a.name, a.brokerage, listingRow.city || "");
      if (!key || seenAgentKeys.has(key)) continue;
      seenAgentKeys.add(key);

      const agentRow: any = {
        name: a.name,
        brokerage: a.brokerage || null,
        city: listingRow.city || null,
        normalized_key: key,
        source: "apify_zillow",
      };
      if (a.profile_url) agentRow.agent_profile_url = a.profile_url;
      if (a.zuid) agentRow.agent_zuid = a.zuid;

      const { data: agent } = await supabase
        .from("af_agents")
        .upsert(agentRow, { onConflict: "normalized_key" })
        .select("id")
        .single();

      if (agent?.id) {
        newAgents++;
        await supabase.from("af_agent_listings").insert({
          agent_id: agent.id, listing_id: listing.id,
        });
      }
    }

    await supabase.from("af_scrape_jobs").update({
      status: "completed",
      pages_scraped: 1,
      new_listings: newListings,
      new_agents: newAgents,
      completed_at: new Date().toISOString(),
    }).eq("id", jobId);

    await supabase.from("target_locations")
      .update({ last_scraped_at: new Date().toISOString() })
      .eq("location", location);

    return new Response(JSON.stringify({
      ok: true, jobId, location,
      itemsReturned: items.length,
      newListings, newAgents,
      tokenUsed,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    if (jobId) {
      await supabase.from("af_scrape_jobs").update({
        status: "failed", error_log: e?.message || String(e), completed_at: new Date().toISOString(),
      }).eq("id", jobId);
    }
    return new Response(JSON.stringify({ ok: false, error: e?.message || String(e), location }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

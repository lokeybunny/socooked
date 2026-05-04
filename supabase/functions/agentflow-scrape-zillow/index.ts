import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const APIFY_TOKENS = [
  Deno.env.get("APIFY_TOKEN"),
].filter((t): t is string => !!t);

const ACTOR_ID = "maxcopell~zillow-scraper"; // Apify actor format uses ~

function normKey(name: string, brokerage: string, city: string) {
  return `${(name || "").trim().toLowerCase()}|${(brokerage || "").trim().toLowerCase()}|${(city || "").trim().toLowerCase()}`;
}

function locationToZillowUrl(location: string): string {
  // Apify maxcopell/zillow-scraper REQUIRES ?searchQueryState=... in the URL.
  // We build a for-sale search using usersSearchTerm + a wide US mapBounds so the
  // actor's pagination/map zoom-in logic narrows down to the location automatically.
  const searchQueryState = {
    pagination: {},
    usersSearchTerm: location,
    mapBounds: { west: -125, east: -66, south: 24, north: 50 },
    isMapVisible: true,
    isListVisible: true,
    filterState: {
      sort: { value: "days" },
      ah: { value: true },
    },
  };
  const encoded = encodeURIComponent(JSON.stringify(searchQueryState));
  return `https://www.zillow.com/homes/for_sale/?searchQueryState=${encoded}`;
}

function parseApifyError(status: number, body: string): { error: string; code?: string } {
  let message = body;
  let type = "";
  try {
    const parsed = JSON.parse(body);
    message = parsed?.error?.message || parsed?.message || body;
    type = parsed?.error?.type || parsed?.type || "";
  } catch (_) {
    // Keep raw body if Apify returns non-JSON.
  }

  if (type === "platform-feature-disabled" && /monthly usage hard limit/i.test(message)) {
    return {
      code: "APIFY_MONTHLY_LIMIT",
      error: "Apify monthly usage hard limit exceeded. Raise the monthly usage hard limit or add credits in Apify, then retry the scrape.",
    };
  }

  return { error: `token rejected ${status}: ${message.slice(0, 300)}` };
}

async function runApifyActor(searchUrls: string[], maxItems: number): Promise<{ items: any[]; tokenUsed: string | null; error?: string; code?: string }> {
  const input = {
    searchUrls: searchUrls.map((url) => ({ url })),
    extractionMethod: "PAGINATION_WITH_ZOOM_IN",
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
        const body = (await r.text()).slice(0, 400);
        const parsedError = parseApifyError(r.status, body);
        lastError = parsedError.error;
        if (parsedError.code === "APIFY_MONTHLY_LIMIT") {
          return { items: [], tokenUsed: null, error: parsedError.error, code: parsedError.code };
        }
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
    const { items, tokenUsed, error, code } = await runApifyActor([searchUrl], maxItems);

    if (error) {
      await supabase.from("af_scrape_jobs").update({
        status: "failed", error_log: error, completed_at: new Date().toISOString(),
      }).eq("id", jobId);
      return new Response(JSON.stringify({ ok: false, error, code, location }), {
        status: code === "APIFY_MONTHLY_LIMIT" ? 200 : 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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

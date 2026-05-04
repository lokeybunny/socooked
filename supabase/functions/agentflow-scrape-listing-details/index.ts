// Stage 2: scrape Zillow LISTING detail pages via maxcopell/zillow-detail-scraper.
// Detail pages return contactRecipients[] with displayName, agentProfileUrl, phoneNumbers (cell/business/brokerage).
// This creates real agent rows AND inserts phone contacts in one pass.
// Backfill-friendly: pulls listings that have no associated real agents yet.

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

const ACTOR_ID = "maxcopell~zillow-detail-scraper";

function normalizePhone(raw: string): string | null {
  const digits = (raw || "").replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

function normKey(name: string, brokerage: string, city: string) {
  return `${(name || "").trim().toLowerCase()}|${(brokerage || "").trim().toLowerCase()}|${(city || "").trim().toLowerCase()}`;
}

function parseApifyError(status: number, body: string): { error: string; code?: string } {
  let message = body;
  let type = "";
  try {
    const parsed = JSON.parse(body);
    message = parsed?.error?.message || parsed?.message || body;
    type = parsed?.error?.type || parsed?.type || "";
  } catch (_) { /* keep raw */ }
  if (type === "platform-feature-disabled" && /monthly usage hard limit/i.test(message)) {
    return {
      code: "APIFY_MONTHLY_LIMIT",
      error: "Apify monthly usage hard limit exceeded. Raise the monthly usage hard limit or add credits in Apify, then retry.",
    };
  }
  return { error: `apify ${status}: ${message.slice(0, 300)}` };
}

async function runDetailActor(startUrls: string[]): Promise<{ items: any[]; error?: string; code?: string; tokenUsed: string | null }> {
  const input = {
    startUrls: startUrls.map((url) => ({ url })),
    proxy: { useApifyProxy: true },
    maxItems: startUrls.length,
  };

  let lastError = "no tokens available";
  for (const token of APIFY_TOKENS) {
    try {
      const url = `https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync-get-dataset-items?token=${token}&clean=true&format=json`;
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(540000),
      });
      if (r.status === 401 || r.status === 402 || r.status === 403) {
        const body = (await r.text()).slice(0, 500);
        const parsed = parseApifyError(r.status, body);
        lastError = parsed.error;
        if (parsed.code === "APIFY_MONTHLY_LIMIT") {
          return { items: [], tokenUsed: null, error: parsed.error, code: parsed.code };
        }
        continue;
      }
      if (!r.ok) {
        lastError = `apify ${r.status}: ${(await r.text()).slice(0, 300)}`;
        continue;
      }
      const items = await r.json();
      return { items: Array.isArray(items) ? items : [], tokenUsed: token.slice(0, 8) + "..." };
    } catch (e: any) {
      lastError = e?.message || String(e);
    }
  }
  return { items: [], tokenUsed: null, error: lastError };
}

type AgentInfo = {
  name: string;
  brokerage: string;
  profile_url: string | null;
  zuid: string | null;
  email: string | null;
  isPremier: boolean;
  phones: { cell: string | null; business: string | null; brokerage: string | null };
};

function extractAgentsFromDetail(item: any): AgentInfo[] {
  const out: AgentInfo[] = [];
  const recipients = item.contactRecipients || item.contact_recipients || [];

  for (const r of recipients) {
    const name = String(r.displayName || r.display_name || r.agentName || "").trim();
    if (!name) continue;
    const phones = r.phoneNumbers || r.phone_numbers || {};
    const profileRaw = r.agentProfileUrl || r.agent_profile_url || r.profileUrl || null;
    const profile_url = profileRaw
      ? (String(profileRaw).startsWith("http") ? String(profileRaw) : `https://www.zillow.com${profileRaw}`)
      : null;

    out.push({
      name,
      brokerage: String(r.agentBrokerName || r.brokerName || r.businessName || "").trim(),
      profile_url,
      zuid: r.agentZuid || r.zuid || null,
      email: r.email || null,
      isPremier: r.badgeType === "PREMIER_AGENT" || !!r.isPremierAgent,
      phones: {
        cell: phones.cell ? normalizePhone(String(phones.cell)) : null,
        business: phones.business ? normalizePhone(String(phones.business)) : null,
        brokerage: phones.brokerage ? normalizePhone(String(phones.brokerage)) : null,
      },
    });
  }

  // Fallback: legacy attribution shape
  if (out.length === 0) {
    const attr = item.attributionInfo || item.listing_agent || {};
    const name = String(attr.agentName || attr.agent_name || "").trim();
    if (name) {
      const profileRaw = attr.agentProfileUrl || attr.agent_profile_url || null;
      out.push({
        name,
        brokerage: String(attr.brokerName || attr.broker_name || "").trim(),
        profile_url: profileRaw
          ? (String(profileRaw).startsWith("http") ? String(profileRaw) : `https://www.zillow.com${profileRaw}`)
          : null,
        zuid: attr.agentZuid || attr.agent_zuid || null,
        email: attr.agentEmail || null,
        isPremier: false,
        phones: {
          cell: attr.agentPhoneNumber ? normalizePhone(String(attr.agentPhoneNumber)) : null,
          business: attr.brokerPhoneNumber ? normalizePhone(String(attr.brokerPhoneNumber)) : null,
          brokerage: null,
        },
      });
    }
  }

  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body.limit) || 25, 1), 50);
    const cityFilter = body.city ? String(body.city) : null;

    if (APIFY_TOKENS.length === 0) {
      return new Response(JSON.stringify({ ok: false, error: "no APIFY_TOKEN configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pick listings with a URL that have NOT been detail-scraped yet (no real agent linked
    // via af_agent_listings to a row that has agent_profile_url set, OR no rows at all).
    // Simple heuristic: listing has no entry in af_agent_listings yet, OR all linked agents
    // have NULL agent_profile_url (the brokerage-only fallback rows).
    let q = supabase
      .from("af_listings")
      .select("id, zpid, listing_url, city")
      .not("listing_url", "is", null);
    if (cityFilter) q = q.eq("city", cityFilter);
    // Order by oldest scraped first so we make progress on backfill
    const { data: listings, error: lErr } = await q.order("scraped_at", { ascending: true }).limit(limit * 4);
    if (lErr) throw lErr;
    if (!listings || listings.length === 0) {
      return new Response(JSON.stringify({ ok: true, message: "no listings to detail-scrape", processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Filter out listings that already have a linked agent WITH a profile_url
    const ids = listings.map((l) => l.id);
    const { data: alreadyLinked } = await supabase
      .from("af_agent_listings")
      .select("listing_id, af_agents!inner(id, agent_profile_url)")
      .in("listing_id", ids)
      .not("af_agents.agent_profile_url", "is", null);
    const skipSet = new Set((alreadyLinked || []).map((r: any) => r.listing_id));

    const todo = listings.filter((l) => !skipSet.has(l.id)).slice(0, limit);
    if (todo.length === 0) {
      return new Response(JSON.stringify({ ok: true, message: "all candidate listings already have enriched agents", processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const startUrls = todo.map((l) => l.listing_url!);
    const urlToListing = new Map<string, { id: string; city: string | null; zpid: string }>();
    for (const l of todo) urlToListing.set(l.listing_url!, { id: l.id, city: l.city, zpid: l.zpid });

    const { items, error, code, tokenUsed } = await runDetailActor(startUrls);
    if (error) {
      return new Response(JSON.stringify({ ok: false, error, code, urls_attempted: startUrls.length }), {
        status: code === "APIFY_MONTHLY_LIMIT" ? 200 : 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let agentsCreated = 0;
    let agentsUpdated = 0;
    let cellsFound = 0;
    let businessFound = 0;
    let listingsProcessed = 0;
    const seenAgentKeys = new Set<string>();

    for (const item of items) {
      // Match item back to listing by URL or zpid
      const itemUrl = String(item.url || item.detailUrl || item.startUrl || "");
      const itemZpid = String(item.zpid || item.id || "");
      let listing = urlToListing.get(itemUrl) || urlToListing.get(itemUrl.replace(/\/$/, ""));
      if (!listing && itemZpid) {
        for (const v of urlToListing.values()) {
          if (v.zpid === itemZpid) { listing = v; break; }
        }
      }
      if (!listing) continue;
      listingsProcessed++;

      const agents = extractAgentsFromDetail(item);
      for (const a of agents) {
        const key = normKey(a.name, a.brokerage, listing.city || "");
        if (!key || seenAgentKeys.has(key)) {
          // still link the listing if we have an existing agent row by key
          const { data: existing } = await supabase
            .from("af_agents").select("id").eq("normalized_key", key).maybeSingle();
          if (existing?.id) {
            await supabase.from("af_agent_listings").upsert(
              { agent_id: existing.id, listing_id: listing.id },
              { onConflict: "agent_id,listing_id", ignoreDuplicates: true },
            );
          }
          continue;
        }
        seenAgentKeys.add(key);

        const agentRow: any = {
          name: a.name,
          brokerage: a.brokerage || null,
          city: listing.city || null,
          normalized_key: key,
          source: "apify_zillow_detail",
          last_profile_scraped_at: new Date().toISOString(),
        };
        if (a.profile_url) agentRow.agent_profile_url = a.profile_url;
        if (a.zuid) agentRow.agent_zuid = a.zuid;
        if (a.email) agentRow.email = a.email;
        if (a.isPremier) agentRow.is_premier_agent = true;
        if (!a.phones.cell && !a.phones.business && !a.phones.brokerage) {
          agentRow.skip_reason = "no_phone_on_listing";
        }

        const { data: agent, error: agErr } = await supabase
          .from("af_agents")
          .upsert(agentRow, { onConflict: "normalized_key" })
          .select("id, last_profile_scraped_at")
          .single();
        if (agErr || !agent?.id) continue;

        if (agent.last_profile_scraped_at) agentsUpdated++; else agentsCreated++;

        await supabase.from("af_agent_listings").upsert(
          { agent_id: agent.id, listing_id: listing.id },
          { onConflict: "agent_id,listing_id", ignoreDuplicates: true },
        );

        if (a.phones.cell) {
          await supabase.from("af_agent_contacts").upsert({
            agent_id: agent.id, phone: a.phones.cell, phone_type: "mobile",
            is_valid: false, source: "apify_listing_detail_cell",
          }, { onConflict: "phone" });
          cellsFound++;
        }
        if (a.phones.business) {
          await supabase.from("af_agent_contacts").upsert({
            agent_id: agent.id, phone: a.phones.business, phone_type: "unknown",
            is_valid: false, source: "apify_listing_detail_business",
          }, { onConflict: "phone" });
          businessFound++;
        }
        if (a.phones.brokerage && !a.phones.business) {
          await supabase.from("af_agent_contacts").upsert({
            agent_id: agent.id, phone: a.phones.brokerage, phone_type: "landline",
            is_valid: false, source: "apify_listing_detail_brokerage",
          }, { onConflict: "phone" });
        }
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      urlsRequested: startUrls.length,
      itemsReturned: items.length,
      listingsProcessed,
      agentsCreated,
      agentsUpdated,
      cellsFound,
      businessFound,
      tokenUsed,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

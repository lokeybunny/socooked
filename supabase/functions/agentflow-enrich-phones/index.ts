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

async function runDetailActor(startUrls: string[]): Promise<{ items: any[]; error?: string; tokenUsed: string | null }> {
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
        lastError = `token rejected: ${r.status}`;
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

function extractPhonesFromDetail(item: any): { cell: string | null; business: string | null; brokerage: string | null; email: string | null; isPremier: boolean } {
  // The detail scraper output contains contactRecipients[] and listed_by sections
  const recipients = item.contactRecipients || item.contact_recipients || [];
  let cell: string | null = null;
  let business: string | null = null;
  let brokerage: string | null = null;
  let email: string | null = null;
  let isPremier = false;

  for (const r of recipients) {
    const phones = r.phoneNumbers || r.phone_numbers || {};
    if (!cell && phones.cell) cell = normalizePhone(String(phones.cell));
    if (!business && phones.business) business = normalizePhone(String(phones.business));
    if (!brokerage && phones.brokerage) brokerage = normalizePhone(String(phones.brokerage));
    if (!email && r.email) email = String(r.email);
    if (r.badgeType === "PREMIER_AGENT" || r.isPremierAgent) isPremier = true;
  }

  // Fallback: top-level fields some actor versions emit
  const attr = item.listing_agent || item.attributionInfo || {};
  if (!cell) cell = normalizePhone(String(attr.agentPhoneNumber || attr.agent_phone_number || item.agentPhoneNumber || ""));
  if (!business) business = normalizePhone(String(attr.brokerPhoneNumber || attr.broker_phone_number || ""));

  return { cell, business, brokerage, email, isPremier };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body.limit) || 30, 1), 50);

    if (APIFY_TOKENS.length === 0) {
      return new Response(JSON.stringify({ ok: false, error: "no APIFY_TOKEN configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pull agents with profile URL, never enriched (or stale 30+ days), no contact yet
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: agents, error: aErr } = await supabase
      .from("af_agents")
      .select("id, name, agent_profile_url, last_profile_scraped_at")
      .not("agent_profile_url", "is", null)
      .or(`last_profile_scraped_at.is.null,last_profile_scraped_at.lt.${thirtyDaysAgo}`)
      .limit(limit);

    if (aErr) throw aErr;
    if (!agents || agents.length === 0) {
      return new Response(JSON.stringify({ ok: true, message: "no agents to enrich", processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const urlToAgent = new Map<string, string>();
    const startUrls: string[] = [];
    for (const a of agents) {
      if (a.agent_profile_url && !urlToAgent.has(a.agent_profile_url)) {
        urlToAgent.set(a.agent_profile_url, a.id);
        startUrls.push(a.agent_profile_url);
      }
    }

    const { items, error, tokenUsed } = await runDetailActor(startUrls);
    if (error) {
      return new Response(JSON.stringify({ ok: false, error, urls_attempted: startUrls.length }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let cellsFound = 0;
    let businessFound = 0;
    let processed = 0;

    for (const item of items) {
      processed++;
      const sourceUrl = item.url || item.startUrl || item.input?.url || "";
      const agentId = urlToAgent.get(sourceUrl) || urlToAgent.get(sourceUrl.replace(/\/$/, ""));
      if (!agentId) continue;

      const { cell, business, brokerage, email, isPremier } = extractPhonesFromDetail(item);

      // Update agent metadata
      const updates: any = { last_profile_scraped_at: new Date().toISOString() };
      if (email) updates.email = email;
      if (isPremier) updates.is_premier_agent = true;
      if (!cell && !business) updates.skip_reason = "no_phone_on_profile";
      await supabase.from("af_agents").update(updates).eq("id", agentId);

      // Insert contacts (cell preferred, business as fallback)
      if (cell) {
        await supabase.from("af_agent_contacts").upsert({
          agent_id: agentId, phone: cell, phone_type: "mobile", is_valid: false, source: "apify_cell",
        }, { onConflict: "phone" });
        cellsFound++;
      }
      if (business) {
        await supabase.from("af_agent_contacts").upsert({
          agent_id: agentId, phone: business, phone_type: "unknown", is_valid: false, source: "apify_business",
        }, { onConflict: "phone" });
        businessFound++;
      }
      if (brokerage && !business) {
        await supabase.from("af_agent_contacts").upsert({
          agent_id: agentId, phone: brokerage, phone_type: "landline", is_valid: false, source: "apify_brokerage",
        }, { onConflict: "phone" });
      }
    }

    return new Response(JSON.stringify({
      ok: true, processed, agentsRequested: agents.length,
      cellsFound, businessFound, tokenUsed,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

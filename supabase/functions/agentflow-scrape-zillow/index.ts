import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ZENROWS_API_KEY = Deno.env.get("ZENROWS_API_KEY") || "";

function normKey(name: string, brokerage: string, city: string) {
  return `${(name || "").trim().toLowerCase()}|${(brokerage || "").trim().toLowerCase()}|${(city || "").trim().toLowerCase()}`;
}

async function fetchZenrows(url: string) {
  const u = new URL("https://api.zenrows.com/v1/");
  u.searchParams.set("apikey", ZENROWS_API_KEY);
  u.searchParams.set("url", url);
  u.searchParams.set("js_render", "true");
  u.searchParams.set("premium_proxy", "true");
  u.searchParams.set("proxy_country", "us");
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(u.toString(), { signal: AbortSignal.timeout(60000) });
      if (r.ok) return await r.text();
    } catch (_) { /* retry */ }
    await new Promise(r => setTimeout(r, 2000 + Math.random() * 4000));
  }
  return null;
}

function parseListings(html: string) {
  const out: any[] = [];
  // Try Zillow's embedded JSON
  const m = html.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (m) {
    try {
      const data = JSON.parse(m[1]);
      const results = data?.props?.pageProps?.searchPageState?.cat1?.searchResults?.listResults
        || data?.props?.pageProps?.searchResults?.listResults || [];
      for (const r of results) {
        const zpid = String(r.zpid || r.id || "");
        if (!zpid) continue;
        out.push({
          zpid,
          address: r.address || r.addressStreet,
          city: r.addressCity,
          state: r.addressState,
          zip: r.addressZipcode,
          price: typeof r.unformattedPrice === "number" ? r.unformattedPrice : null,
          listing_url: r.detailUrl?.startsWith("http") ? r.detailUrl : `https://www.zillow.com${r.detailUrl || ""}`,
          agent_name: r.brokerName || r.attributionInfo?.agentName,
          brokerage: r.brokerName || r.attributionInfo?.brokerName,
          phone: r.attributionInfo?.agentPhoneNumber || r.attributionInfo?.brokerPhoneNumber,
        });
      }
    } catch (_) {}
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  let jobId: string | null = null;
  try {
    const { location, max_pages = 5 } = await req.json().catch(() => ({} as any));
    if (!location) return json({ ok: false, error: "missing location" }, 400);
    if (!ZENROWS_API_KEY) return json({ ok: false, error: "ZENROWS_API_KEY not set" }, 400);

    const { data: job } = await supabase.from("af_scrape_jobs").insert({
      status: "running", target_location: location,
    }).select("id").single();
    jobId = job?.id;

    let pages = 0, newListings = 0, newAgents = 0;
    const slug = encodeURIComponent(location.replace(/,\s*/g, "-").replace(/\s+/g, "-").toLowerCase());

    for (let p = 1; p <= max_pages; p++) {
      const url = p === 1
        ? `https://www.zillow.com/homes/${slug}_rb/`
        : `https://www.zillow.com/homes/${slug}/${p}_p/`;
      const html = await fetchZenrows(url);
      if (!html) continue;
      pages++;
      const items = parseListings(html);
      if (items.length === 0) break;

      for (const it of items) {
        const { data: lst, error: le } = await supabase.from("af_listings").upsert({
          zpid: it.zpid, address: it.address, city: it.city, state: it.state,
          zip: it.zip, price: it.price, listing_url: it.listing_url,
          scraped_at: new Date().toISOString(),
        }, { onConflict: "zpid" }).select("id").single();
        if (le || !lst) continue;
        if (le === null) newListings++;

        if (it.agent_name) {
          const key = normKey(it.agent_name, it.brokerage || "", it.city || "");
          const { data: ag } = await supabase.from("af_agents").upsert({
            name: it.agent_name, brokerage: it.brokerage, city: it.city,
            normalized_key: key, source: "zillow",
          }, { onConflict: "normalized_key" }).select("id").single();
          if (ag) {
            newAgents++;
            await supabase.from("af_agent_listings").upsert({
              agent_id: ag.id, listing_id: lst.id,
            }, { onConflict: "agent_id,listing_id" });
            if (it.phone) {
              const phone = String(it.phone).replace(/\D/g, "").slice(-10);
              if (phone.length === 10) {
                await supabase.from("af_agent_contacts").upsert({
                  agent_id: ag.id, phone: `+1${phone}`,
                }, { onConflict: "phone" });
              }
            }
          }
        }
      }
      await new Promise(r => setTimeout(r, 2000 + Math.random() * 4000));
    }

    await supabase.from("af_scrape_jobs").update({
      status: "completed", pages_scraped: pages,
      new_listings: newListings, new_agents: newAgents,
      completed_at: new Date().toISOString(),
    }).eq("id", jobId!);
    await supabase.from("target_locations").update({ last_scraped_at: new Date().toISOString() }).eq("location", location);

    return json({ ok: true, jobId, pages, newListings, newAgents });
  } catch (e: any) {
    if (jobId) await supabase.from("af_scrape_jobs").update({
      status: "failed", error_log: e?.message || String(e), completed_at: new Date().toISOString(),
    }).eq("id", jobId);
    return json({ ok: false, error: e?.message || String(e) }, 500);
  }
});

function json(b: any, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

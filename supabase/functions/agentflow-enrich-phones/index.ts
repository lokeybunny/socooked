import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ZENROWS_API_KEY = Deno.env.get("ZENROWS_API_KEY") || "";

async function zenrows(url: string) {
  const u = new URL("https://api.zenrows.com/v1/");
  u.searchParams.set("apikey", ZENROWS_API_KEY);
  u.searchParams.set("url", url);
  u.searchParams.set("js_render", "true");
  u.searchParams.set("premium_proxy", "true");
  u.searchParams.set("proxy_country", "us");
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(u.toString(), { signal: AbortSignal.timeout(60000) });
      if (r.ok) return await r.text();
    } catch (_) {}
    await new Promise(r => setTimeout(r, 1500));
  }
  return null;
}

function normPhone(raw: string): string | null {
  const d = String(raw || "").replace(/\D/g, "").slice(-10);
  if (d.length === 10 && /^[2-9]/.test(d)) return `+1${d}`;
  return null;
}

function extractFromListingDetail(html: string): { phones: string[]; profile_url?: string; zuid?: string; email?: string } {
  const phones = new Set<string>();
  let profile_url: string | undefined;
  let zuid: string | undefined;
  let email: string | undefined;

  // Try __NEXT_DATA__ JSON blob
  const m = html.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (m) {
    try {
      const data = JSON.parse(m[1]);
      const blob = JSON.stringify(data);
      // Walk for attributionInfo / listingAgent
      const phoneMatches = blob.match(/"agentPhoneNumber"\s*:\s*"([^"]+)"/g) || [];
      for (const pm of phoneMatches) {
        const p = pm.match(/"([^"]+)"$/)?.[1];
        const np = p ? normPhone(p) : null;
        if (np) phones.add(np);
      }
      const brokerPhones = blob.match(/"brokerPhoneNumber"\s*:\s*"([^"]+)"/g) || [];
      for (const pm of brokerPhones) {
        const p = pm.match(/"([^"]+)"$/)?.[1];
        const np = p ? normPhone(p) : null;
        if (np) phones.add(np);
      }
      const profMatch = blob.match(/"agentProfileUrl"\s*:\s*"([^"]+)"/);
      if (profMatch) profile_url = profMatch[1].startsWith("http") ? profMatch[1] : `https://www.zillow.com${profMatch[1]}`;
      const zuidMatch = blob.match(/"agentZuid"\s*:\s*"([^"]+)"/) || blob.match(/"zuid"\s*:\s*"([^"]+)"/);
      if (zuidMatch) zuid = zuidMatch[1];
      const emailMatch = blob.match(/"agentEmail"\s*:\s*"([^"]+)"/);
      if (emailMatch) email = emailMatch[1];
    } catch (_) {}
  }

  // Fallback: tel: links and raw phone regex
  const telMatches = html.match(/tel:\+?1?[-.\s(]*\d{3}[-.\s)]*\d{3}[-.\s]*\d{4}/g) || [];
  for (const t of telMatches) {
    const np = normPhone(t);
    if (np) phones.add(np);
  }

  return { phones: [...phones], profile_url, zuid, email };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  try {
    if (!ZENROWS_API_KEY) return json({ ok: false, error: "ZENROWS_API_KEY not set" }, 400);

    // Find agents with NO phone contacts; pick a recent listing to scrape for each
    const { data: agents } = await supabase
      .from("af_agents")
      .select("id, name, profile_url, af_agent_contacts(id), af_agent_listings(listing_id, af_listings(listing_url))")
      .limit(15);

    const need = (agents || []).filter((a: any) => !a.af_agent_contacts?.length);
    let phonesAdded = 0;
    let processed = 0;

    for (const a of need) {
      const links = (a as any).af_agent_listings || [];
      const listingUrl = links.map((l: any) => l.af_listings?.listing_url).find(Boolean);
      if (!listingUrl) continue;

      const html = await zenrows(listingUrl);
      if (!html) continue;
      processed++;

      const { phones, profile_url, zuid, email } = extractFromListingDetail(html);

      // Save profile_url + zuid if newly discovered
      const updates: any = {};
      if (profile_url && !a.profile_url) updates.profile_url = profile_url;
      if (zuid) updates.zuid = zuid;
      if (Object.keys(updates).length) {
        await supabase.from("af_agents").update(updates).eq("id", a.id);
      }

      for (const p of phones) {
        const { error } = await supabase.from("af_agent_contacts").upsert({
          agent_id: a.id, phone: p,
        }, { onConflict: "phone" });
        if (!error) phonesAdded++;
      }

      await new Promise(r => setTimeout(r, 1500 + Math.random() * 2500));
    }

    return json({ ok: true, processed, phones_added: phonesAdded, candidates: need.length });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || String(e) }, 500);
  }
});

function json(b: any, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

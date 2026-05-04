import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ZENROWS_API_KEY = Deno.env.get("ZENROWS_API_KEY") || "";

// Profile-only enrichment: cheapest viable ZenRows config (js_render=false first)
async function fetchProfile(url: string, jsRender: boolean): Promise<string | null> {
  const u = new URL("https://api.zenrows.com/v1/");
  u.searchParams.set("apikey", ZENROWS_API_KEY);
  u.searchParams.set("url", url);
  if (jsRender) u.searchParams.set("js_render", "true");
  u.searchParams.set("premium_proxy", "true");
  u.searchParams.set("proxy_country", "us");
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(u.toString(), { signal: AbortSignal.timeout(40000) });
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

interface ProfileExtract {
  cell?: string | null;
  business?: string | null;
  brokerage?: string | null;
  email?: string | null;
  is_premier?: boolean;
}

function extractProfile(html: string): ProfileExtract {
  const out: ProfileExtract = {};
  const m = html.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (m) {
    try {
      const data = JSON.parse(m[1]);
      const blob = JSON.stringify(data);

      // Direct phoneNumbers.cell (gold)
      const cellMatch = blob.match(/"phoneNumbers"\s*:\s*\{[^}]*"cell"\s*:\s*"([^"]+)"/);
      if (cellMatch) out.cell = normPhone(cellMatch[1]);

      const bizMatch = blob.match(/"phoneNumbers"\s*:\s*\{[^}]*"business"\s*:\s*"([^"]+)"/);
      if (bizMatch) out.business = normPhone(bizMatch[1]);

      const brokMatch = blob.match(/"phoneNumbers"\s*:\s*\{[^}]*"brokerage"\s*:\s*"([^"]+)"/);
      if (brokMatch) out.brokerage = normPhone(brokMatch[1]);

      const emailMatch = blob.match(/"email"\s*:\s*"([^"@]+@[^"]+)"/);
      if (emailMatch) out.email = emailMatch[1];

      const premMatch = blob.match(/"isPremierAgent"\s*:\s*(true|false)/);
      if (premMatch) out.is_premier = premMatch[1] === "true";
    } catch (_) {}
  }

  // JSON-LD fallback
  if (!out.cell && !out.business) {
    const ldMatch = html.match(/"telephone"\s*:\s*"([^"]+)"/);
    if (ldMatch) out.business = normPhone(ldMatch[1]);
  }

  // tel: fallback
  if (!out.cell && !out.business) {
    const tel = html.match(/tel:\+?1?[-.\s(]*\d{3}[-.\s)]*\d{3}[-.\s]*\d{4}/);
    if (tel) out.business = normPhone(tel[0]);
  }

  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  try {
    if (!ZENROWS_API_KEY) return json({ ok: false, error: "ZENROWS_API_KEY not set" }, 400);

    // Find agents with profile URL, no contacts yet, not scraped in last 30 days
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: agents } = await supabase
      .from("af_agents")
      .select("id, name, agent_profile_url, agent_zuid, last_profile_scraped_at, af_agent_contacts(id)")
      .not("agent_profile_url", "is", null)
      .is("skip_reason", null)
      .or(`last_profile_scraped_at.is.null,last_profile_scraped_at.lt.${cutoff}`)
      .limit(50);

    const need = (agents || []).filter((a: any) => !a.af_agent_contacts?.length);

    let processed = 0, cellAdded = 0, bizAdded = 0, jsRenderUsed = 0;

    for (const a of need) {
      const url = (a as any).agent_profile_url as string;
      if (!url) continue;

      // Step 1: try cheapest (no JS)
      let html = await fetchProfile(url, false);
      let extracted = html ? extractProfile(html) : {};

      // Step 2: fallback to JS render if no cell found
      if (html && !extracted.cell) {
        html = await fetchProfile(url, true);
        if (html) {
          extracted = extractProfile(html);
          jsRenderUsed++;
        }
      }
      processed++;

      const updates: any = { last_profile_scraped_at: new Date().toISOString() };
      if (extracted.email) updates.email = extracted.email;
      if (typeof extracted.is_premier === "boolean") updates.is_premier_agent = extracted.is_premier;
      await supabase.from("af_agents").update(updates).eq("id", a.id);

      // Only insert verified mobile (cell). Business as fallback labeled.
      if (extracted.cell) {
        const { error } = await supabase.from("af_agent_contacts").upsert({
          agent_id: a.id, phone: extracted.cell, source: "profile_cell",
        }, { onConflict: "phone" });
        if (!error) cellAdded++;
      } else if (extracted.business) {
        const { error } = await supabase.from("af_agent_contacts").upsert({
          agent_id: a.id, phone: extracted.business, source: "profile_business",
        }, { onConflict: "phone" });
        if (!error) bizAdded++;
      }

      await new Promise(r => setTimeout(r, 800 + Math.random() * 1200));
    }

    return json({
      ok: true, candidates: need.length, processed,
      cell_added: cellAdded, business_added: bizAdded,
      js_render_fallbacks: jsRenderUsed,
    });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || String(e) }, 500);
  }
});

function json(b: any, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

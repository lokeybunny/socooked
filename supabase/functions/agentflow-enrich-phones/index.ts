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
  try {
    const r = await fetch(u.toString(), { signal: AbortSignal.timeout(45000) });
    if (r.ok) return await r.text();
  } catch (_) {}
  return null;
}

function extractPhones(html: string): string[] {
  const matches = html.match(/(?:\+?1[-.\s]?)?\(?([2-9]\d{2})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})/g) || [];
  const set = new Set<string>();
  for (const m of matches) {
    const d = m.replace(/\D/g, "").slice(-10);
    if (d.length === 10 && /^[2-9]/.test(d)) set.add(`+1${d}`);
  }
  return [...set].slice(0, 5);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  try {
    if (!ZENROWS_API_KEY) return json({ ok: false, error: "ZENROWS_API_KEY not set" }, 400);

    // Find agents with NO contacts at all
    const { data: agents } = await supabase
      .from("af_agents")
      .select("id, name, brokerage, city, af_agent_contacts(id)")
      .limit(20);
    const need = (agents || []).filter((a: any) => !a.af_agent_contacts?.length);
    let added = 0;

    for (const a of need) {
      const q = encodeURIComponent(`"${a.name}" ${a.brokerage || ""} ${a.city || ""} real estate phone`);
      const url = `https://www.google.com/search?q=${q}`;
      const html = await zenrows(url);
      if (!html) continue;
      const phones = extractPhones(html);
      for (const p of phones) {
        const { error } = await supabase.from("af_agent_contacts").insert({ agent_id: a.id, phone: p });
        if (!error) added++;
      }
      await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000));
    }

    return json({ ok: true, processed: need.length, added });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || String(e) }, 500);
  }
});

function json(b: any, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

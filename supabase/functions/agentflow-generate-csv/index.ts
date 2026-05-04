import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function csvEscape(v: any) {
  if (v == null) return "";
  const s = String(v).replace(/"/g, '""');
  return /[",\n]/.test(s) ? `"${s}"` : s;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // Pull most recent valid mobile contacts joined with agent + most recent listing
  const { data: contacts } = await supabase
    .from("af_agent_contacts")
    .select("phone, validated_at, af_agents(name, brokerage, city, af_agent_listings(listing_id, af_listings(address, city, state, zip, price, listing_url, scraped_at)))")
    .eq("is_valid", true)
    .eq("phone_type", "mobile")
    .order("validated_at", { ascending: false })
    .limit(10000);

  const header = ["agent_name","brokerage","phone","city","state","zip","listing_address","price","listing_url","scraped_at"];
  const lines = [header.join(",")];
  for (const c of contacts || []) {
    const a: any = (c as any).af_agents;
    const links = a?.af_agent_listings || [];
    const latest = links.map((l: any) => l.af_listings).filter(Boolean).sort((x: any, y: any) => new Date(y.scraped_at).getTime() - new Date(x.scraped_at).getTime())[0];
    lines.push([
      a?.name, a?.brokerage, (c as any).phone, latest?.city || a?.city, latest?.state, latest?.zip,
      latest?.address, latest?.price, latest?.listing_url, latest?.scraped_at || (c as any).validated_at,
    ].map(csvEscape).join(","));
  }
  const csv = lines.join("\n");
  const today = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="agentflow-mobiles-${today}.csv"`,
    },
  });
});

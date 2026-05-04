import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID")!;
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN")!;

async function lookup(phone: string) {
  const url = `https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(phone)}?Fields=line_type_intelligence`;
  const auth = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
  const r = await fetch(url, { headers: { Authorization: `Basic ${auth}` }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) return null;
  return await r.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  try {
    const { data: rows } = await supabase
      .from("af_agent_contacts")
      .select("id, phone")
      .is("validated_at", null)
      .limit(200);

    let mobiles = 0;
    for (const r of rows || []) {
      try {
        const res = await lookup(r.phone);
        const type = (res?.line_type_intelligence?.type || "unknown").toLowerCase();
        const is_valid = !!res?.valid && (type === "mobile");
        const phoneType = type === "mobile" ? "mobile"
          : type.includes("landline") ? "landline"
          : type.includes("voip") ? "voip" : "unknown";
        await supabase.from("af_agent_contacts").update({
          phone_type: phoneType, is_valid, validated_at: new Date().toISOString(),
        }).eq("id", r.id);
        if (is_valid) mobiles++;
      } catch (_) {
        await supabase.from("af_agent_contacts").update({
          phone_type: "unknown", is_valid: false, validated_at: new Date().toISOString(),
        }).eq("id", r.id);
      }
    }
    return json({ ok: true, processed: rows?.length || 0, valid_mobiles: mobiles });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || String(e) }, 500);
  }
});

function json(b: any, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

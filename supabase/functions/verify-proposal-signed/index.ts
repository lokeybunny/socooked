import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { email } = await req.json().catch(() => ({}));
    const clean = String(email || "").trim().toLowerCase();
    if (!clean || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
      return new Response(JSON.stringify({ ok: false, eligible: false, error: "Invalid email" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data, error } = await sb
      .from("proposals")
      .select("id, signed_at, client_name")
      .eq("status", "signed")
      .ilike("client_email", clean)
      .not("signed_at", "is", null)
      .limit(1);

    if (error) throw error;

    const eligible = Array.isArray(data) && data.length > 0;
    return new Response(
      JSON.stringify({
        ok: true,
        eligible,
        client_name: eligible ? data![0].client_name : null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, eligible: false, error: String(e?.message || e) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

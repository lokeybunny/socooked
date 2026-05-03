import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { testConnection, hasCreds } from "../_shared/leadsrainClient.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    // JWT validate (admin-only feature surface)
    const authHeader = req.headers.get("Authorization") || "";
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return json({ success: false, message: "Unauthorized" }, 401);

    if (!hasCreds()) {
      return json({ success: false, message: "LeadsRain credentials missing on server (LEADSRAIN_USERNAME / LEADSRAIN_API_KEY)" }, 200);
    }

    const result = await testConnection();
    return json({
      success: result.ok,
      message: result.ok ? "LeadsRain API connected" : `LeadsRain rejected: ${result.error || "unknown error"}`,
      raw: result.raw,
    });
  } catch (e: any) {
    return json({ success: false, message: e?.message || String(e) }, 500);
  }
});

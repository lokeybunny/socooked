// Returns recent logs from the `twilio-sms-inbound` edge function.
// Used by the SMS page "TWILIO INBOUND" panel for near-realtime monitoring.
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.3/cors";

const PROJECT_REF = "mziuxsfxevjnmdwnrqjs";
const SUPABASE_ACCESS_TOKEN = Deno.env.get("SUPABASE_ACCESS_TOKEN") ?? "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 500);

    // Supabase Management API: query function logs via Logflare-backed analytics endpoint
    const sql = `
      select id, timestamp, event_message, metadata
      from function_edge_logs
      cross join unnest(metadata) as m
      where m.function_id = (
        select id from function_edge_logs
        cross join unnest(metadata) as mm
        where mm.function_id is not null
        limit 1
      )
      order by timestamp desc
      limit ${limit}
    `;

    // Fallback: just call the Management API logs endpoint for the function
    const apiUrl = `https://api.supabase.com/v1/projects/${PROJECT_REF}/functions/twilio-sms-inbound/logs?limit=${limit}`;
    const res = await fetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      const text = await res.text();
      return new Response(
        JSON.stringify({ ok: false, error: `Logs API ${res.status}: ${text.slice(0, 200)}` }),
        { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await res.json();
    return new Response(JSON.stringify({ ok: true, logs: data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

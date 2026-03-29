import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const VAPI_API_KEY = Deno.env.get("VAPI_API_KEY");
    if (!VAPI_API_KEY) {
      return new Response(JSON.stringify({ error: "VAPI_API_KEY not set" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch recent calls from Vapi (last 100)
    const url = new URL("https://api.vapi.ai/call");
    url.searchParams.set("limit", "100");
    url.searchParams.set("sortOrder", "DESC");

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${VAPI_API_KEY}`,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      return new Response(JSON.stringify({ error: "Vapi API error", details: errText }), {
        status: res.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const calls = await res.json();

    // Map to simplified call records with cost info
    const records = (Array.isArray(calls) ? calls : []).map((call: any) => {
      const cost = call.cost ?? call.costBreakdown?.total ?? 0;
      const transportCost = call.costBreakdown?.transport ?? 0;
      const modelCost = call.costBreakdown?.model ?? 0;
      const transcriptionCost = call.costBreakdown?.transcriber ?? 0;
      const voiceCost = call.costBreakdown?.voice ?? 0;
      const analysisCost = call.costBreakdown?.analysis ?? 0;

      const startedAt = call.startedAt || call.createdAt;
      const endedAt = call.endedAt;
      const durationSec = startedAt && endedAt
        ? Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000)
        : 0;

      return {
        id: call.id,
        type: call.type || "unknown",
        status: call.status || call.endedReason || "unknown",
        customerNumber: call.customer?.number || null,
        startedAt,
        endedAt,
        durationSec,
        cost,
        transportCost,
        modelCost,
        transcriptionCost,
        voiceCost,
        analysisCost,
        endedReason: call.endedReason || null,
      };
    });

    // Compute summary
    const totalCost = records.reduce((sum: number, r: any) => sum + (r.cost || 0), 0);
    const totalCalls = records.length;
    const totalDuration = records.reduce((sum: number, r: any) => sum + (r.durationSec || 0), 0);
    const avgCostPerCall = totalCalls > 0 ? totalCost / totalCalls : 0;
    const completedCalls = records.filter((r: any) =>
      r.status === "ended" || r.endedReason === "assistant-forward" || r.endedReason === "customer-ended-call" || r.endedReason === "assistant-ended-call"
    ).length;

    return new Response(
      JSON.stringify({
        summary: {
          totalCost: Math.round(totalCost * 100) / 100,
          totalCalls,
          completedCalls,
          totalDurationMin: Math.round(totalDuration / 60 * 10) / 10,
          avgCostPerCall: Math.round(avgCostPerCall * 100) / 100,
        },
        calls: records,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

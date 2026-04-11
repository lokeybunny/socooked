import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.3/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const workerUrl = Deno.env.get("STUDIO_WORKER_URL");
  
  if (!workerUrl) {
    return new Response(JSON.stringify({
      online: false,
      message: "STUDIO_WORKER_URL not configured",
      supported_modes: ["t2v", "i2v", "ti2v"],
      queue_depth: 0,
      last_success: null,
      hardware_tier: "unknown",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const workerKey = Deno.env.get("STUDIO_WORKER_API_KEY");
    const headers: Record<string, string> = {};
    if (workerKey) headers["Authorization"] = `Bearer ${workerKey}`;

    const res = await fetch(`${workerUrl}/health`, { headers, signal: AbortSignal.timeout(5000) });
    
    if (res.ok) {
      const data = await res.json();
      return new Response(JSON.stringify({
        online: true,
        message: "Worker is online",
        supported_modes: data.supported_modes || ["t2v", "i2v", "ti2v"],
        queue_depth: data.queue_depth || 0,
        last_success: data.last_success || null,
        hardware_tier: data.hardware_tier || "GPU",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      online: false,
      message: `Worker returned ${res.status}`,
      supported_modes: [],
      queue_depth: 0,
      last_success: null,
      hardware_tier: "unknown",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({
      online: false,
      message: `Worker unreachable: ${(err as Error).message}`,
      supported_modes: [],
      queue_depth: 0,
      last_success: null,
      hardware_tier: "unknown",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

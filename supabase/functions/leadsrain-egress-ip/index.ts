const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Query multiple IP echo services in parallel — these are the IPs LeadsRain sees
    const sources = [
      "https://api.ipify.org?format=json",
      "https://ifconfig.me/all.json",
      "https://ipinfo.io/json",
    ];

    const results = await Promise.allSettled(
      sources.map((u) =>
        fetch(u, { signal: AbortSignal.timeout(8000) }).then((r) => r.json())
      )
    );

    const ips = new Set<string>();
    for (const r of results) {
      if (r.status === "fulfilled") {
        const v = r.value;
        const ip = v.ip || v.ip_addr || v.address;
        if (ip) ips.add(ip);
      }
    }

    return new Response(
      JSON.stringify({
        success: ips.size > 0,
        ips: [...ips],
        primary_ip: [...ips][0] ?? null,
        note: "Whitelist this IP in LeadsRain as Temp ID or Permanent ID. Supabase Edge Functions rotate IPs — you may see different IPs across calls.",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ success: false, error: String(e?.message ?? e) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function getAccessToken(): Promise<string> {
  const clientId = Deno.env.get("RINGCENTRAL_CLIENT_ID")!;
  const clientSecret = Deno.env.get("RINGCENTRAL_CLIENT_SECRET")!;
  const jwtToken = Deno.env.get("RINGCENTRAL_JWT_TOKEN")!;

  const res = await fetch("https://platform.ringcentral.com/restapi/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + btoa(`${clientId}:${clientSecret}`),
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwtToken,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Auth failed [${res.status}]: ${err}`);
  }
  const data = await res.json();
  return data.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const accessToken = await getAccessToken();
    const webhookUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/ringcentral-webhook`;

    // Check existing subscriptions first
    const listRes = await fetch(
      "https://platform.ringcentral.com/restapi/v1.0/subscription",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const listData = await listRes.json();
    const existing = (listData.records || []).filter(
      (s: any) => s.deliveryMode?.address === webhookUrl && s.status === "Active"
    );

    // Delete existing subscriptions to re-register with updated filters
    for (const sub of existing) {
      await fetch(
        `https://platform.ringcentral.com/restapi/v1.0/subscription/${sub.id}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } }
      );
    }

    // Create new subscription
    const subRes = await fetch(
      "https://platform.ringcentral.com/restapi/v1.0/subscription",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          eventFilters: [
            "/restapi/v1.0/account/~/extension/~/message-store",
            "/restapi/v1.0/account/~/extension/~/telephony/sessions",
            "/restapi/v1.0/account/~/extension/~/presence?detailedTelephonyState=true",
          ],
          deliveryMode: {
            transportType: "WebHook",
            address: webhookUrl,
          },
          expiresIn: 630720000, // max ~20 years
        }),
      }
    );

    const subData = await subRes.json();
    if (!subRes.ok) {
      throw new Error(`Subscription failed [${subRes.status}]: ${JSON.stringify(subData)}`);
    }

    return new Response(
      JSON.stringify({ success: true, subscription: subData }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("ringcentral-subscribe error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

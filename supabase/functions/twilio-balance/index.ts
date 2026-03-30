import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
    const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");

    if (!TWILIO_ACCOUNT_SID) throw new Error("TWILIO_ACCOUNT_SID not configured");
    if (!TWILIO_AUTH_TOKEN) throw new Error("TWILIO_AUTH_TOKEN not configured");

    // Fetch account balance
    const balanceRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Balance.json`,
      {
        headers: {
          Authorization: "Basic " + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`),
        },
      }
    );

    if (!balanceRes.ok) {
      const errText = await balanceRes.text();
      throw new Error(`Twilio API error [${balanceRes.status}]: ${errText}`);
    }

    const balanceData = await balanceRes.json();

    // Fetch recent usage (current month)
    const now = new Date();
    const startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const endDate = now.toISOString().split("T")[0];

    const usageRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Usage/Records.json?Category=calls&StartDate=${startDate}&EndDate=${endDate}`,
      {
        headers: {
          Authorization: "Basic " + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`),
        },
      }
    );

    let usageData = { usage_records: [] };
    if (usageRes.ok) {
      usageData = await usageRes.json();
    }

    // Also fetch SMS usage
    const smsUsageRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Usage/Records.json?Category=sms&StartDate=${startDate}&EndDate=${endDate}`,
      {
        headers: {
          Authorization: "Basic " + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`),
        },
      }
    );

    let smsUsageData = { usage_records: [] };
    if (smsUsageRes.ok) {
      smsUsageData = await smsUsageRes.json();
    }

    // Parse usage records
    const callRecords = usageData.usage_records || [];
    const smsRecords = smsUsageData.usage_records || [];

    const totalCallCost = callRecords.reduce((s: number, r: any) => s + parseFloat(r.price || "0"), 0);
    const totalCallCount = callRecords.reduce((s: number, r: any) => s + parseInt(r.count || "0", 10), 0);
    const totalCallMinutes = callRecords.reduce((s: number, r: any) => s + parseInt(r.usage || "0", 10), 0);

    const totalSmsCost = smsRecords.reduce((s: number, r: any) => s + parseFloat(r.price || "0"), 0);
    const totalSmsCount = smsRecords.reduce((s: number, r: any) => s + parseInt(r.count || "0", 10), 0);

    return new Response(
      JSON.stringify({
        balance: parseFloat(balanceData.balance || "0"),
        currency: balanceData.currency || "USD",
        accountSid: TWILIO_ACCOUNT_SID,
        monthlyUsage: {
          calls: {
            cost: Math.round(Math.abs(totalCallCost) * 100) / 100,
            count: totalCallCount,
            minutes: totalCallMinutes,
          },
          sms: {
            cost: Math.round(Math.abs(totalSmsCost) * 100) / 100,
            count: totalSmsCount,
          },
          totalCost: Math.round((Math.abs(totalCallCost) + Math.abs(totalSmsCost)) * 100) / 100,
        },
        period: { start: startDate, end: endDate },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("twilio-balance error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

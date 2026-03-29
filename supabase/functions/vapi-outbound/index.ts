import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const VAPI_API_KEY = Deno.env.get("VAPI_API_KEY");
    const VAPI_PHONE_NUMBER_ID = Deno.env.get("VAPI_PHONE_NUMBER_ID");
    if (!VAPI_API_KEY) throw new Error("VAPI_API_KEY not configured");
    if (!VAPI_PHONE_NUMBER_ID) throw new Error("VAPI_PHONE_NUMBER_ID not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { action, lead_id } = await req.json();

    if (action === "trigger_call") {
      // Fetch lead
      const { data: lead, error: leadErr } = await sb
        .from("lw_landing_leads")
        .select("*, lw_landing_pages!lw_landing_leads_landing_page_id_fkey(client_name, phone)")
        .eq("id", lead_id)
        .single();

      if (leadErr || !lead) {
        return new Response(JSON.stringify({ error: "Lead not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const clientName = (lead as any).lw_landing_pages?.client_name || "our team";

      // Create Vapi call
      const vapiRes = await fetch("https://api.vapi.ai/call/phone", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${VAPI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          assistant: {
            model: {
              provider: "openai",
              model: "gpt-4o",
              messages: [
                {
                  role: "system",
                  content: `You are a friendly, professional real estate acquisition specialist calling on behalf of ${clientName}. The homeowner's name is ${lead.full_name} and their property is at ${lead.property_address}. They just submitted a request for a cash offer on their property.

Your goals:
1. Confirm they submitted the request and verify the property address
2. Ask about the property condition (good, fair, needs work, major repairs needed)
3. Ask about their timeline for selling (ASAP, 1-3 months, flexible, just exploring)
4. Ask about their motivation for selling (downsizing, relocation, financial, inherited, divorce, other)
5. Ask if they have a price in mind or what they'd consider a fair offer
6. Ask for their email address for follow-up
7. Let them know someone from the team will follow up with a formal cash offer within 24 hours

Be warm, empathetic, and conversational. Don't rush. If they seem hesitant, reassure them there's no obligation. Keep the call under 3 minutes. Always be respectful of their time.

IMPORTANT: At the end of the call, summarize your findings clearly.`,
                },
              ],
            },
            voice: {
              provider: "11labs",
              voiceId: "21m00Tcm4TlvDq8ikWAM",
            },
            firstMessage: `Hi ${lead.full_name.split(" ")[0]}! This is a call from ${clientName}. I saw you just submitted a request about getting a cash offer for your property. Is now a good time to chat for a couple minutes?`,
            serverUrl: `${SUPABASE_URL}/functions/v1/vapi-webhook`,
          },
          customer: {
            number: (() => {
              let ph = (lead.phone || "").replace(/\D/g, "");
              if (!ph.startsWith("1") && ph.length === 10) ph = "1" + ph;
              return "+" + ph;
            })(),
          },
        }),
      });

      const vapiData = await vapiRes.json();

      if (!vapiRes.ok) {
        console.error("Vapi error:", vapiData);
        await sb
          .from("lw_landing_leads")
          .update({ vapi_call_status: "failed" })
          .eq("id", lead_id);

        return new Response(JSON.stringify({ error: "Vapi call failed", details: vapiData }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Update lead with call ID
      await sb
        .from("lw_landing_leads")
        .update({
          vapi_call_id: vapiData.id,
          vapi_call_status: "calling",
        })
        .eq("id", lead_id);

      return new Response(JSON.stringify({ success: true, call_id: vapiData.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("vapi-outbound error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

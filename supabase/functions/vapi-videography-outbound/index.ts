import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DEFAULT_ASSISTANT_ID = "0045f12e-56e2-4245-971b-1f7dd2069282";

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

    const { action, customer_id, phone, full_name, event_type, message, assistant_id } = await req.json();

    if (action === "trigger_call") {
      if (!phone || !full_name) {
        return new Response(JSON.stringify({ error: "phone and full_name required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Normalize phone to E.164
      const customerNumber = (() => {
        let ph = (phone || "").trim().replace(/\D/g, "");
        if (ph.length === 11 && ph.startsWith("1")) ph = ph.slice(1);
        if (ph.length !== 10) {
          console.error(`[vapi-videography] Invalid phone: "${ph}" (original: "${phone}")`);
          return null;
        }
        return `+1${ph}`;
      })();

      if (!customerNumber) {
        return new Response(JSON.stringify({ error: "Invalid phone number — must be a valid 10-digit US number" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const firstName = full_name.split(" ")[0];

      const vapiRes = await fetch("https://api.vapi.ai/call/phone", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${VAPI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          assistantId: assistant_id || DEFAULT_ASSISTANT_ID,
          assistantOverrides: {
            variableValues: {
              clientName: "Warren Guru Videography",
              leadName: full_name,
              firstName,
              eventType: event_type || "event",
              message: message || "",
            },
            serverUrl: `${SUPABASE_URL}/functions/v1/vapi-webhook`,
          },
          phoneNumberId: VAPI_PHONE_NUMBER_ID,
          customer: {
            number: customerNumber,
          },
        }),
      });

      const vapiData = await vapiRes.json();

      if (!vapiRes.ok) {
        console.error("Vapi error:", vapiData);
        return new Response(JSON.stringify({ error: "Vapi call failed", details: vapiData }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Always save vapi call info to customers table by phone lookup
      const normalizedPhone = customerNumber.replace('+1', '');
      const { data: custRow } = await sb
        .from("customers")
        .select("id, meta")
        .or(`phone.eq.${normalizedPhone},phone.eq.${customerNumber},phone.eq.${phone}`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (custRow) {
        await sb.from("customers").update({
          meta: {
            ...(custRow.meta as any || {}),
            vapi_call_id: vapiData.id,
            vapi_call_status: "calling",
            vapi_assistant: "videography",
            vapi_triggered_at: new Date().toISOString(),
          },
        }).eq("id", custRow.id);
        console.log(`[vapi-videography] Saved call_id to customer ${custRow.id}`);
      } else if (customer_id) {
        await sb.from("customers").update({
          meta: {
            vapi_call_id: vapiData.id,
            vapi_call_status: "calling",
            vapi_assistant: "videography",
            vapi_triggered_at: new Date().toISOString(),
          },
        }).eq("id", customer_id);
      }

      console.log(`[vapi-videography] Call triggered for ${firstName} (${customerNumber}), call_id: ${vapiData.id}`);

      return new Response(JSON.stringify({ success: true, call_id: vapiData.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("vapi-videography-outbound error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

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

    const { action, lead_id, phone, landing_page_id, full_name, property_address } = await req.json();

    if (action === "trigger_call") {
      // Fetch lead with landing page — support both lead_id lookup and phone+landing_page_id lookup
      let leadQuery = sb
        .from("lw_landing_leads")
        .select("*, lw_landing_pages!lw_landing_leads_landing_page_id_fkey(id, client_name, phone, email, vapi_credit_balance_cents, vapi_total_spent_cents)");

      if (lead_id) {
        leadQuery = leadQuery.eq("id", lead_id);
      } else if (phone && landing_page_id) {
        leadQuery = leadQuery.eq("phone", phone).eq("landing_page_id", landing_page_id).order("created_at", { ascending: false }).limit(1);
      } else {
        return new Response(JSON.stringify({ error: "lead_id or phone+landing_page_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: leadRows, error: leadErr } = await leadQuery;
      const lead = leadRows?.[0] || null;

      if (leadErr || !lead) {
        return new Response(JSON.stringify({ error: "Lead not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const landingPage = (lead as any).lw_landing_pages;
      const clientName = landingPage?.client_name || "our team";

      // ─── Credit check ───
      const creditBalance = landingPage?.vapi_credit_balance_cents ?? 2000;
      if (creditBalance <= 0) {
        console.log(`[vapi-outbound] Credit exhausted for landing page ${landingPage?.id}, skipping call`);

        // Update lead status
        await sb
          .from("lw_landing_leads")
          .update({ vapi_call_status: "credit_exhausted" })
          .eq("id", lead.id);

        return new Response(JSON.stringify({
          error: "Phone credits exhausted",
          credit_exhausted: true,
          message: "Your phone credits have been used up. Please contact Warren for more credits.",
        }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

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
          phoneNumberId: VAPI_PHONE_NUMBER_ID,
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
          .eq("id", lead.id);

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
        .eq("id", lead.id);

      return new Response(JSON.stringify({ success: true, call_id: vapiData.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Sync call data from Vapi API for stuck leads ───
    if (action === "sync_call") {
      if (!lead_id) {
        return new Response(JSON.stringify({ error: "lead_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: lead, error: leadErr } = await sb
        .from("lw_landing_leads")
        .select("*")
        .eq("id", lead_id)
        .single();

      if (leadErr || !lead) {
        return new Response(JSON.stringify({ error: "Lead not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!lead.vapi_call_id) {
        return new Response(JSON.stringify({ error: "No Vapi call ID on this lead" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fetch call details from Vapi API
      const vapiRes = await fetch(`https://api.vapi.ai/call/${lead.vapi_call_id}`, {
        headers: { Authorization: `Bearer ${VAPI_API_KEY}` },
      });

      if (!vapiRes.ok) {
        const errText = await vapiRes.text();
        return new Response(JSON.stringify({ error: "Vapi API error", details: errText }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const call = await vapiRes.json();
      const status = call.status; // "queued", "ringing", "in-progress", "forwarding", "ended"
      const endedReason = call.endedReason || null;
      const transcript = call.transcript || call.artifact?.transcript || "";
      const summary = call.summary || call.artifact?.summary || call.analysis?.summary || "";
      const recordingUrl = call.recordingUrl || call.artifact?.recordingUrl || null;
      // Compute duration: prefer explicit field, fall back to timestamp diff
      let duration = call.duration || call.costBreakdown?.duration || 0;
      if (!duration && call.startedAt && call.endedAt) {
        duration = (new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000;
      }
      if (!duration && call.artifact?.duration) {
        duration = call.artifact.duration;
      }
      const costCents = Math.round((call.cost || 0) * 100);

      const callEnded = status === "ended";
      // Only mark as failed if there's no transcript/summary AND it looks like a non-connect
      const hasContent = !!(transcript || summary);
      const callFailed = callEnded && !hasContent && (
        ["no-answer", "busy", "voicemail", "machine-detected", "customer-did-not-answer", "customer-busy"].includes(endedReason) ||
        duration < 15
      );

      // Build AI notes
      let aiNotes = lead.ai_notes;
      if (callEnded) {
        if (callFailed) {
          aiNotes = `AI Agent could not connect.\n• Reason: ${(endedReason || "unknown").replace(/-/g, " ")}\n• Duration: ${Math.round(duration)}s`;
        } else {
          const lines: string[] = ["AI Notes:", ""];
          if (summary) lines.push("• Call Summary: " + summary);
          lines.push(`• Call Duration: ${Math.round(duration)}s`);
          lines.push(`• Call Outcome: ${(endedReason || "completed").replace(/-/g, " ")}`);
          if (recordingUrl) lines.push(`• Recording: ${recordingUrl}`);
          aiNotes = lines.join("\n");
        }
      }

      // Update lead
      const updates: Record<string, any> = {
        vapi_call_status: callFailed ? "no_answer" : callEnded ? "completed" : status,
        ai_notes: aiNotes,
        vapi_recording_url: recordingUrl || lead.vapi_recording_url,
        meta: {
          ...(lead.meta as any),
          vapi_transcript: transcript || (lead.meta as any)?.vapi_transcript,
          vapi_summary: summary || (lead.meta as any)?.vapi_summary,
          vapi_recording_url: recordingUrl || (lead.meta as any)?.vapi_recording_url,
          vapi_ended_reason: endedReason || (lead.meta as any)?.vapi_ended_reason,
          vapi_duration_seconds: duration || (lead.meta as any)?.vapi_duration_seconds,
          vapi_cost_cents: costCents || (lead.meta as any)?.vapi_cost_cents,
          vapi_synced_at: new Date().toISOString(),
        },
      };

      await sb.from("lw_landing_leads").update(updates).eq("id", lead.id);

      return new Response(JSON.stringify({
        success: true,
        call_status: status,
        ended_reason: endedReason,
        has_transcript: !!transcript,
        has_summary: !!summary,
        duration,
      }), {
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

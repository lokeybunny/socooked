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
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const payload = await req.json();
    const { message } = payload;

    console.log("Vapi webhook event:", message?.type, "call:", message?.call?.id);

    // Handle end-of-call report
    if (message?.type === "end-of-call-report") {
      const callId = message.call?.id;
      if (!callId) {
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Find the lead by vapi_call_id
      const { data: lead } = await sb
        .from("lw_landing_leads")
        .select("id")
        .eq("vapi_call_id", callId)
        .single();

      if (!lead) {
        console.log("No lead found for call:", callId);
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Extract transcript and summary
      const transcript = message.transcript || "";
      const summary = message.summary || "";
      const recordingUrl = message.recordingUrl || null;
      const endedReason = message.endedReason || "unknown";
      const duration = message.call?.duration || 0;

      // Build AI notes from the conversation
      const aiNotes = buildAINotes(transcript, summary, endedReason, duration, recordingUrl);

      // Update lead
      await sb
        .from("lw_landing_leads")
        .update({
          vapi_call_status: endedReason === "assistant-error" ? "failed" : "completed",
          ai_notes: aiNotes,
          meta: {
            vapi_transcript: transcript,
            vapi_summary: summary,
            vapi_recording_url: recordingUrl,
            vapi_ended_reason: endedReason,
            vapi_duration_seconds: duration,
          },
        })
        .eq("id", lead.id);

      console.log("Updated lead", lead.id, "with AI notes");
    }

    // Handle status updates
    if (message?.type === "status-update") {
      const callId = message.call?.id;
      const status = message.status;
      if (callId && status) {
        await sb
          .from("lw_landing_leads")
          .update({ vapi_call_status: status === "ended" ? "completed" : status })
          .eq("vapi_call_id", callId);
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("vapi-webhook error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function buildAINotes(
  transcript: string,
  summary: string,
  endedReason: string,
  duration: number,
  recordingUrl: string | null
): string {
  const lines: string[] = [];
  lines.push("AI Notes:");
  lines.push("");

  if (summary) {
    lines.push("• Call Summary: " + summary);
  }

  lines.push(`• Call Duration: ${Math.round(duration)}s`);
  lines.push(`• Call Outcome: ${endedReason.replace(/-/g, " ")}`);

  if (recordingUrl) {
    lines.push(`• Recording: ${recordingUrl}`);
  }

  // Try to extract key info from transcript
  if (transcript) {
    const lower = transcript.toLowerCase();

    // Property condition
    const conditionPatterns = [
      { pattern: /(?:major|significant)\s*repair/i, value: "Major repairs needed" },
      { pattern: /needs?\s*(?:some\s*)?work/i, value: "Needs work" },
      { pattern: /(?:fair|okay|decent)\s*(?:condition|shape)/i, value: "Fair condition" },
      { pattern: /(?:good|great|excellent)\s*(?:condition|shape)/i, value: "Good condition" },
    ];
    for (const { pattern, value } of conditionPatterns) {
      if (pattern.test(transcript)) {
        lines.push(`• Property Condition: ${value}`);
        break;
      }
    }

    // Timeline
    const timelinePatterns = [
      { pattern: /asap|as\s*soon\s*as\s*possible|right\s*away|immediately/i, value: "ASAP" },
      { pattern: /(?:1|one|two|2|three|3)\s*(?:to\s*(?:3|three))?\s*months?/i, value: "1-3 months" },
      { pattern: /flexible|no\s*rush|whenever/i, value: "Flexible" },
      { pattern: /just\s*(?:looking|exploring|curious)/i, value: "Just exploring" },
    ];
    for (const { pattern, value } of timelinePatterns) {
      if (pattern.test(transcript)) {
        lines.push(`• Selling Timeline: ${value}`);
        break;
      }
    }

    // Motivation
    const motivationPatterns = [
      { pattern: /downsize|downsizing/i, value: "Downsizing" },
      { pattern: /relocat|moving/i, value: "Relocation" },
      { pattern: /financ|behind\s*on\s*payment|foreclosure/i, value: "Financial hardship" },
      { pattern: /inherit/i, value: "Inherited property" },
      { pattern: /divorce|separat/i, value: "Divorce/Separation" },
    ];
    for (const { pattern, value } of motivationPatterns) {
      if (pattern.test(transcript)) {
        lines.push(`• Motivation: ${value}`);
        break;
      }
    }

    // Price mentions
    const priceMatch = transcript.match(/\$[\d,]+(?:\.\d{2})?|\b(\d{2,3})\s*(?:thousand|k)\b/i);
    if (priceMatch) {
      lines.push(`• Price Mentioned: ${priceMatch[0]}`);
    }

    // Email
    const emailMatch = transcript.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (emailMatch) {
      lines.push(`• Email Captured: ${emailMatch[0]}`);
    }
  }

  return lines.join("\n");
}
